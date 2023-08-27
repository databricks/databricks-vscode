import asyncio
from functools import reduce
from io import StringIO
import logging
import shutil
from typing import Any, Generic, List, Protocol, TypeVar
from pygls.server import LanguageServer
from pygls import workspace, uris
from dlt_lib.server import Dltutils
import re
from lsprotocol import types
from graph import plot
from pyspark.sql.types import StructType
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.catalog import CatalogInfo, SchemaInfo, TableInfo

logging.basicConfig(level="DEBUG")
client = WorkspaceClient()

CacheObjectType = TypeVar('CacheObjectType')
CacheType = dict[str, CacheObjectType]
class SharedCache(Generic[CacheObjectType]):
    def __init__(self, cache: CacheType[CacheObjectType]) -> None:
        self.lock = asyncio.Lock()
        self.cache = cache

class ExpandingItems(Protocol):
    def expand(self, force:bool =False) -> None:
        pass

class ExpandingCatalogInfo:
    def __init__(self, info: CatalogInfo):
        self.info = info
        self.expanded = False
        self.children: dict[str, ExpandingSchemaInfo] = {}
        self.children_type = "Schema"
        super().__init__()

    def expand(self, force:bool=False):
        if (self.expanded and not force) or self.info.name is None:
            return
        
        self.expanded = True
        self.children = {
            i.name: ExpandingSchemaInfo(i) for i in client.schemas.list(self.info.name) if i.name is not None
        }

class ExpandingSchemaInfo:
    def __init__(self, info: SchemaInfo):
        self.info = info
        self.expanded = False
        self.children: dict[str,TableInfo] = {}
        self.children_type = "Table"
        super().__init__()

    def expand(self, force:bool=False):
        if (self.expanded and not force) or self.info.name is None or self.info.catalog_name is None:
            return
        
        self.expanded = True
        self.children = {
            i.name: i for i in client.tables.list(self.info.catalog_name , self.info.name) if i.name is not None
        }



class DatabricksLsp(LanguageServer):
    def __init__(self, *args: Any, **kwargs: Any):
        self.catalogs = SharedCache[ExpandingCatalogInfo]({})
        self.catalogs_loaded = False
        self.documents = SharedCache[Document]({})
        self.dlt_utils = Dltutils()
        super().__init__(*args, **kwargs)
        self.fetch_catalogs()

    def fetch_catalogs(self):
        for catalog in client.catalogs.list():
            if catalog.name is not None:
                self.catalogs.cache[catalog.name] = ExpandingCatalogInfo(catalog)

        self.catalogs_loaded = True

class Document:
    def __init__(self, uri: str, version: int = 0) -> None:
        self.uri = uri
        self.version = version
        self.graph_version: int = -1
        self.graph = None
        self.graph_path = None

    def generate_graph(self):
        if self.graph_version >= self.version:
            return

        import sys
        old_path = sys.path
        
        try:
            import os
            import importlib
            import inspect

            sys.path.insert(0, os.path.abspath("./dlt_lib/parser"))
            path = uris.to_fs_path(self.uri)
            sys.path.append(os.path.dirname(path))
            nt = importlib.import_module(os.path.splitext(os.path.basename(path))[0])
            nt = importlib.reload(nt)
            all_functions = inspect.getmembers(nt, inspect.isfunction)
            logging.debug(str(all_functions))
            for key, value in all_functions:
                if str(inspect.signature(value)) == "(*args, **kwargs)":
                    value()

            result = nt.dlt.DLTDecorator()
            graph =  result.getDependencies()
            self.graph_version = self.version
            logging.debug(f"comparing {graph} and {self.graph}")
            if self.graph is None or graph != self.graph or self.graph_path is None:
                self.graph_path = plot(graph, result.tables)
            self.graph = graph
            
            
        except Exception as e:
            logging.error(e)
        finally:
            sys.path = old_path

lsp = DatabricksLsp("databricks-vscode", "0.0.0", max_workers=1)


@lsp.feature(types.TEXT_DOCUMENT_DID_OPEN)
def handle_open(server: DatabricksLsp, params: types.DidOpenTextDocumentParams):
    document = Document(params.text_document.uri)
    server.documents.cache[params.text_document.uri] = document

@lsp.feature(types.TEXT_DOCUMENT_DID_CHANGE)
def handle_change(server: DatabricksLsp, params: types.DidChangeTextDocumentParams):
    uri = params.text_document.uri
    if server.documents.cache[uri].version < params.text_document.version:
        server.documents.cache[uri].version = params.text_document.version

@lsp.feature(types.TEXT_DOCUMENT_DID_SAVE)
def handle_save(server: DatabricksLsp, params: types.DidSaveTextDocumentParams):
    uri = params.text_document.uri
    document = server.documents.cache[uri]
    document.generate_graph()
    server.send_notification("lsp/showImage", document.graph_path)

def to_completion_item(l: List[str], item_type:str, sort_text: str, kind: types.CompletionItemKind = types.CompletionItemKind.Module):
    l = list(set(l))
    return [
        types.CompletionItem(
            l[i],
            kind = kind,
            documentation=item_type,
            sort_text = sort_text,
            label_details=types.CompletionItemLabelDetails(description=item_type),
            detail=item_type
        ) for i in range(len(l))
    ]

def is_in_string(line: str, params: types.CompletionParams): 
    count = {
        "single": 0,
        "double": 0,
    }
    last_qoute = 0
    for i, c in enumerate(line):
        if i >= params.position.character:
            break

        if c == "'" and count["double"] % 2 == 0:
            count["single"] += 1
            last_qoute = i
        if c == '"' and count["single"] % 2 == 0:
            count["double"] += 1
            last_qoute = i
        
    in_string = False
    if count["single"] % 2 != 0 or count["double"] % 2 != 0:
        in_string = True
    
    return in_string, last_qoute

def get_last_word(line:str, last_quote: int, params: types.CompletionParams):
    return line[last_quote+1:params.position.character]

def metastore_completions(server: DatabricksLsp, line: str, params: types.CompletionParams):
    in_string, last_quote = is_in_string(line, params)

    if not in_string:
        return types.CompletionList(is_incomplete = True, items = [])

    last_word: str | None = get_last_word(line, last_quote, params)
    if not server.catalogs_loaded:
        return types.CompletionList(is_incomplete = True, items = [])
    

    if last_word == "":
        return types.CompletionList(is_incomplete = True, items=to_completion_item(list(server.catalogs.cache.keys()), sort_text="zz", item_type="Catalog"))
    
    parts = last_word.strip(".").split(".")
    current_level = server.catalogs.cache
    current_level_item_type = "Catalog"
    for part in parts:
        logging.debug(f"parts: {parts}, {part}")
        if part in current_level and not isinstance(current_level[part], TableInfo):
            current_level[part].expand() # type: ignore
            current_level_item_type: str = current_level[part].children_type # type: ignore
            current_level = current_level[part].children # type: ignore
        else:
            break
    

    return types.CompletionList(is_incomplete = True, items=to_completion_item(list(current_level.keys()), sort_text=current_level_item_type, item_type=current_level_item_type))

def in_pipeline_completions(server: DatabricksLsp, line: str, params: types.CompletionParams):
    in_string, last_quote = is_in_string(line, params)
    if not in_string:
        return types.CompletionList(is_incomplete = True, items = [])
    
    last_word = get_last_word(line, last_quote, params)
    if "." in last_word:
        return types.CompletionList(is_incomplete = True, items = [])
    
    doc = server.documents.cache[params.text_document.uri]
    doc.generate_graph()
    if doc.graph is None:
        return types.CompletionList(is_incomplete = True, items = [])
    
    items = []
    for key in doc.graph:
        items.append(key)
        items = items + [i for i in doc.graph[key]]
    
    return types.CompletionList(
        is_incomplete=True, 
        items = to_completion_item(list(set(items)), "in_pipeline", "a", types.CompletionItemKind.Interface))

    
@lsp.feature(types.TEXT_DOCUMENT_COMPLETION, types.CompletionOptions(trigger_characters=[".", '"', "'", '`']))
def get_completions(server: DatabricksLsp, params: types.CompletionParams):
    # TODO load docs from cache
    document = server.workspace.get_document(params.text_document.uri)

    line = document.lines[params.position.line]

    metastore_c = metastore_completions(server, line, params)
    in_pipeline_c = in_pipeline_completions(server, line, params)

    logging.debug(str(metastore_c.items))
    logging.debug(str(in_pipeline_c.items))
    return types.CompletionList(
        is_incomplete=metastore_c.is_incomplete & in_pipeline_c.is_incomplete,
        items=[*in_pipeline_c.items, *metastore_c.items]
    )

@lsp.feature(types.TEXT_DOCUMENT_CODE_LENS)
def get_code_lens(server: DatabricksLsp, params: types.CodeLensParams):
    document = server.workspace.get_document(params.text_document.uri)
    import re
    raw_lines = document.lines
    lines = [(i, line) for i, line in enumerate(raw_lines) if re.match(r'@dlt.table', line) is not None]
    uri = uris.to_fs_path(params.text_document.uri)
    return [
        types.CodeLens(
            range=types.Range(types.Position(i, 0), types.Position(i, 0)),
            command = types.Command(title="Run", command="lsp/runOnly", arguments=[raw_lines[i+1], uri])
        ) for i, line in lines
    ] + [
        types.CodeLens(
            range=types.Range(types.Position(i, 0), types.Position(i, 0)),
            command = types.Command(title="Run Till Here", command="lsp/runTillHere", arguments=[raw_lines[i+1], uri])
        ) for i, line in lines
    ]

@lsp.command("lsp/runOnly")
def run_only(server: DatabricksLsp, *args):
    logging.debug(f"{args}")
    line, uri = args[0]
    match = re.match(r'def (\w+)', line)
    if match is None:
        return
    
    func_name: str = match.group(1)
    logging.debug(f"running {func_name} from {uri}")
    import subprocess
    import sys
    stdout = sys.stdout
    new_out = StringIO()
    sys.stdout = new_out
    logging.debug(f"{server.dlt_utils.get_graph(uri)}")
    result = server.dlt_utils.run(uri, func_name)

    if hasattr(result, "show"):
        result.show()
    sys.stdout = stdout
    value = new_out.getvalue()
    logging.debug(f"{result} -- {value}")
    server.send_notification("lsp/runOutput", value)
    

@lsp.command("lsp/runTillHere")
def run_till_here(server: DatabricksLsp, *args):
    logging.debug(f"{args}")
    line, uri = args[0]
    match = re.match(r'def (\w+)', line)
    if match is None:
        return
    
    func_name: str = match.group(1)
    logging.debug(f"running {func_name} from {uri}")
    import sys
    stdout = sys.stdout
    new_out = StringIO()
    sys.stdout = new_out
    logging.debug(f"{server.dlt_utils.get_graph(uri)}")
    result = server.dlt_utils.runUntil(uri, func_name)

    if hasattr(result, "show"):
        result.show()
    sys.stdout = stdout
    value = new_out.getvalue()
    logging.debug(f"{result} -- {value}")
    server.send_notification("lsp/runOutput", value)

@lsp.feature(types.TEXT_DOCUMENT_HOVER)
def handle_hover(server: DatabricksLsp, params: types.HoverParams):
    document = server.workspace.get_document(params.text_document.uri)
    line = document.lines[params.position.line]
    match = re.match(r'def (\w+)', line)
    if match is None:
        return
    
    func_name: str = match.group(1)
    
    import sys
    stdout = sys.stdout
    new_out = StringIO()
    sys.stdout = new_out
    server.dlt_utils.printSchema(func_name)
    sys.stdout = stdout
    
    schema = new_out.getvalue()
    return types.Hover(types.MarkupContent(
        kind=types.MarkupKind.Markdown,
        value=schema
    ))
    
    
lsp.start_io()
