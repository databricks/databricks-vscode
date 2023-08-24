from abc import ABC, ABCMeta
import abc
import asyncio
from calendar import c
import re
from typing import Any, Generic, List, Protocol, TypeVar, cast
from pygls import uris, server
from lsprotocol import types
import asyncio

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.catalog import CatalogInfo, SchemaInfo, TableInfo
import logging
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
        super().__init__()

    def expand(self, force:bool=False):
        if (self.expanded and not force) or self.info.name is None or self.info.catalog_name is None:
            return
        
        self.expanded = True
        self.children = {
            i.name: i for i in client.tables.list(self.info.catalog_name , self.info.name) if i.name is not None
        }

class DatabricksLsp(server.LanguageServer):
    def __init__(self, *args: Any, **kwargs: Any):
        self.catalogs = SharedCache[ExpandingCatalogInfo]({})
        self.catalogs_loaded = False
        self.documents = SharedCache[types.TextDocumentItem]({})

        super().__init__(*args, **kwargs)
        self.fetch_catalogs()

    def fetch_catalogs(self):
        for catalog in client.catalogs.list():
            if catalog.name is not None:
                self.catalogs.cache[catalog.name] = ExpandingCatalogInfo(catalog)

        self.catalogs_loaded = True

lsp = DatabricksLsp("databricks-vscode", "0.0.0")

def to_completion_item(l: List[str]):
    l = list(set(l))
    return [
        types.CompletionItem(i, kind = types.CompletionItemKind.Folder) for i in l
    ]

@lsp.feature(types.TEXT_DOCUMENT_COMPLETION, types.CompletionOptions(trigger_characters=[".", '"', "'", '`']))
def completions(server: DatabricksLsp, params: types.CompletionParams):
    # TODO load docs from cache
    document = server.workspace.get_document(params.text_document.uri)

    line = document.lines[params.position.line]

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
        
    logging.debug("count" + str(count) + line)
    in_string = False
    if count["single"] % 2 != 0 or count["double"] % 2 != 0:
        in_string = True

    if not in_string:
        return types.CompletionList(is_incomplete = False, items = [])

    last_word: str | None = line.strip()[last_qoute+1:params.position.character]
    logging.debug(f"last_word: {last_word}, {line.strip()[:params.position.character]}")
    if not server.catalogs_loaded:
        return types.CompletionList(is_incomplete = False, items = [])
    

    if last_word == "":
        return types.CompletionList(is_incomplete = True, items=to_completion_item(list(server.catalogs.cache.keys())))
    
    parts = last_word.strip(".").split(".")
    current_level = server.catalogs.cache
    
    for part in parts:
        logging.debug(f"part: {last_word}, {part}, {current_level.keys()}")
        if part in current_level:
            current_level[part].expand()
            current_level = current_level[part].children
        else:
            break
    
    logging.debug(f"last_word: {last_word}, {parts}")

    return types.CompletionList(is_incomplete = True, items=to_completion_item(list(current_level.keys())))


        
lsp.start_io()
