from contextlib import contextmanager
import functools
import json
from typing import Any, Union, List
import os
import shlex
import warnings
import tempfile


def logError(function_name: str, e: Union[str, Exception]):
    import sys
    msg = [function_name]

    typ = type(e)
    if hasattr(typ, '__name__'):
        msg.append(typ.__name__)
    else:
        msg.append("Error")

    msg.append(str(e))
    print(':'.join(msg), file=sys.stderr)


try:
    from IPython import get_ipython
    from IPython.core.magic import magics_class, Magics, line_magic, needs_local_scope
except Exception as e:
    logError("Ipython Imports", e)

__disposables = []


def disposable(f):
    if hasattr(f, '__name__'):
        __disposables.append(f.__name__)
    return f


def logErrorAndContinue(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logError(f.__name__, e)

    return wrapper

@logErrorAndContinue
@disposable
def load_env_from_leaf(path: str) -> bool:
    curdir = path if os.path.isdir(path) else os.path.dirname(path)
    env_file_path = os.path.join(curdir, ".databricks", ".databricks.env")
    if os.path.exists(os.path.dirname(env_file_path)):
        with open(env_file_path, "r") as f:
            for line in f.readlines():
                key, value = line.strip().split("=", 1)
                os.environ[key] = value
        return True
    
    parent = os.path.dirname(curdir)
    if parent == curdir:
        return False
    return load_env_from_leaf(parent)

@logErrorAndContinue
@disposable
def create_and_register_databricks_globals():
    from databricks.sdk.runtime import dbutils
    from IPython.display import HTML
    from pyspark.sql import functions as udf, SparkSession
    from databricks.connect import DatabricksSession

    # "table", "sc", "sqlContext" are missing
    spark: SparkSession = DatabricksSession.builder.getOrCreate()
    sql = spark.sql

    # We do this to prevent importing widgets implementation prematurely
    # The widget import should prompt users to use the implementation
    # which has ipywidget support.
    def getArgument(*args, **kwargs):
        return dbutils.widgets.getArgument(*args, **kwargs)

    globals()['dbutils'] = dbutils
    globals()['spark'] = spark
    globals()['sql'] = sql
    globals()['getArgument'] = getArgument
    globals()['displayHTML'] = HTML
    globals()['udf'] = udf


@disposable
class EnvLoader:
    transform: type = str

    def __init__(self, env_name: str, default: any = None, required: bool = False):
        self.env_name = env_name
        self.default = default
        self.required = required

    def __get__(self, instance, owner):
        if self.env_name in os.environ:
            return self.transform(os.environ[self.env_name])

        if self.required:
            raise AttributeError(
                "Missing required environment variable: " + self.env_name)

        return self.default

    def __set__(self, instance, value):
        return AttributeError("Can't set a value for properties loaded from env: " + self.env_name)


@disposable
class LocalDatabricksNotebookConfig:
    project_root: str = EnvLoader("DATABRICKS_PROJECT_ROOT", required=True)
    dataframe_display_limit: int = EnvLoader("DATABRICKS_DF_DISPLAY_LIMIT", 20)

    def __new__(cls):
        annotations = cls.__dict__['__annotations__']
        for attr in annotations:
            cls.__dict__[attr].transform = annotations[attr]
        return object.__new__(cls)


@magics_class
@disposable
class DatabricksMagics(Magics):
    @needs_local_scope
    @line_magic
    def fs(self, line: str, local_ns):
        args = shlex.split(line)
        if len(args) == 0:
            return
        cmd_str = args[0]
        dbutils = local_ns["dbutils"]
        if not hasattr(dbutils.fs, cmd_str):
            raise NameError(
                cmd_str
                + " is not a valid command for %fs. Valid commands are "
                + ", ".join(
                    list(filter(lambda i: not i.startswith(
                        "_"), dbutils.fs.__dir__()))
                )
            )
        cmd = dbutils.fs.__getattribute__(cmd_str)
        return cmd(*args[1:])


def is_databricks_notebook(py_file: str):
    if os.path.exists(py_file):
        with open(py_file, "r") as f:
            return "Databricks notebook source" in f.readline()

def strip_hash_magic(lines: List[str]) -> List[str]:
    if len(lines) == 0:
        return lines
    if lines[0].startswith("# MAGIC"):
        return [line.partition("# MAGIC ")[2] for line in lines]
    return lines

def convert_databricks_notebook_to_ipynb(py_file: str):
    cells: List[dict[str, Any]] = [
        {
            "cell_type": "code",
            "source": "import os\nos.chdir('" + os.path.dirname(py_file) + "')\n",
            "metadata": {},
            'outputs': [],
            'execution_count': None
        }
    ]
    with open(py_file) as file:
        text = file.read()
        for cell in text.split("# COMMAND ----------"):
            cell = ''.join(strip_hash_magic(cell.strip().splitlines(keepends=True)))
            cells.append(
                {
                    "cell_type": "code", 
                    "source": cell, 
                    "metadata": {}, 
                    'outputs': [], 
                    'execution_count': None
                }
            )
    
    return json.dumps({
        'cells': cells,
        'metadata': {},
        'nbformat': 4,
        'nbformat_minor': 2
    })

    
@contextmanager
def databricks_notebook_exec_env(project_root: str, py_file: str):
    import sys
    old_sys_path = sys.path
    old_cwd = os.getcwd()

    sys.path.append(project_root)
    sys.path.append(os.path.dirname(py_file))

    try:
        if is_databricks_notebook(py_file):
            notebook = convert_databricks_notebook_to_ipynb(py_file)
            with tempfile.NamedTemporaryFile(suffix=".ipynb") as f:
                f.write(notebook.encode())
                f.flush()
                yield f.name
        else:
            yield py_file
    finally:
        sys.path = old_sys_path
        os.chdir(old_cwd)


@logErrorAndContinue
@disposable
def register_magics(cfg: LocalDatabricksNotebookConfig):
    def warn_for_dbr_alternative(magic: str):
        # Magics that are not supported on Databricks but work in jupyter notebooks.
        # We show a warning, prompting users to use a databricks equivalent instead.
        local_magic_dbr_alternative = {"%%sh": "%sh"}
        if magic in local_magic_dbr_alternative:
            warnings.warn(
                "\n" + magic
                + " is not supported on Databricks. This notebook might fail when running on a Databricks cluster.\n"
                  "Consider using %"
                + local_magic_dbr_alternative[magic]
                + " instead."
            )

    def throw_if_not_supported(magic: str):
        # These are magics that are supported on dbr but not locally.
        unsupported_dbr_magics = ["%r", "%scala"]
        if magic in unsupported_dbr_magics:
            raise NotImplementedError(
                magic
                + " is not supported for local Databricks Notebooks."
            )

    def is_cell_magic(lines: List[str]):
        def get_cell_magic(lines: List[str]):
            if len(lines) == 0:
                return
            if lines[0].strip().startswith("%%"):
                return lines[0].split(" ")[0].strip()
            
        def handle(lines: List[str]):
            cell_magic = get_cell_magic(lines)
            if cell_magic is None:
                return lines
            warn_for_dbr_alternative(cell_magic)
            throw_if_not_supported(cell_magic)
            return lines

        is_cell_magic.handle = handle
        return get_cell_magic(lines) is not None

    def is_line_magic(lines: List[str]):
        def get_line_magic(lines: List[str]):
            if len(lines) == 0:
                return
            if lines[0].strip().startswith("%"):
                return lines[0].split(" ")[0].strip().strip("%")
            
        def handle(lines: List[str]):
            lmagic = get_line_magic(lines)
            if lmagic is None:
                return lines
            warn_for_dbr_alternative(lmagic)
            throw_if_not_supported(lmagic)

            if lmagic == "md" or lmagic == "md-sandbox":
                lines[0] = (
                    "%%markdown" +
                    lines[0].partition("%" + lmagic)[2]
                )
                return lines

            if lmagic == "sh":
                lines[0] = "%%sh" + \
                           lines[0].partition("%" + lmagic)[2]
                return lines

            if lmagic == "sql":
                lines = lines[1:]
                spark_string = (
                    "global _sqldf\n"
                    + "_sqldf = spark.sql('''"
                    + "".join(lines).replace("'", "\\'")
                    + "''')\n"
                    + "_sqldf"
                )
                return spark_string.splitlines(keepends=True)

            if lmagic == "python":
                return lines[1:]
            
            if lmagic == "run":
                rest = lines[0].strip().split(" ")[1:]
                if len(rest) == 0:
                    return lines
                
                filename = rest[0]

                for suffix in ["", ".py", ".ipynb", ".ipy"]:
                    if os.path.exists(os.path.join(os.getcwd(), filename + suffix)):
                        filename = filename + suffix
                        break
                
                return [
                    f"with databricks_notebook_exec_env('{cfg.project_root}', '{filename}') as file:\n",
                    "\t%run -i {file} " + lines[0].partition('%run')[2].partition(filename)[2] + "\n"
                ]
            
            return lines

        is_line_magic.handle = handle
        return get_line_magic(lines) is not None
        

    def parse_line_for_databricks_magics(lines: List[str]):
        if len(lines) == 0:
            return lines
        
        lines = [line for line in lines 
                    if line.strip() != "# Databricks notebook source" and \
                    line.strip() != "# COMMAND ----------"
                ]
        lines = ''.join(lines).strip().splitlines(keepends=True)
        lines = strip_hash_magic(lines)

        for magic_check in [is_cell_magic, is_line_magic]:
            if magic_check(lines):
                return magic_check.handle(lines)

        return lines

    ip = get_ipython()
    ip.register_magics(DatabricksMagics)
    ip.input_transformers_cleanup.append(parse_line_for_databricks_magics)


@logErrorAndContinue
@disposable
def register_formatters(notebook_config: LocalDatabricksNotebookConfig):
    from pyspark.sql.connect.dataframe import DataFrame as SparkConnectDataframe
    from pyspark.sql import DataFrame

    def df_html(df):
        return df.limit(notebook_config.dataframe_display_limit).toPandas().to_html()

    html_formatter = get_ipython().display_formatter.formatters["text/html"]
    html_formatter.for_type(SparkConnectDataframe, df_html)
    html_formatter.for_type(DataFrame, df_html)


@logErrorAndContinue
@disposable
def update_sys_path(notebook_config: LocalDatabricksNotebookConfig):
    sys.path.append(notebook_config.project_root)


@disposable
def make_matplotlib_inline():
    try:
        import matplotlib
        get_ipython().run_line_magic("matplotlib", "inline")
    except Exception as e:
        pass


global _sqldf

try:
    import sys

    print(sys.modules[__name__])
    if not load_env_from_leaf(os.getcwd()):
        sys.exit(1)
    cfg = LocalDatabricksNotebookConfig()
    create_and_register_databricks_globals()
    register_magics(cfg)
    register_formatters(cfg)
    update_sys_path(cfg)
    make_matplotlib_inline()

    for i in __disposables + ['__disposables']:
        globals().pop(i)
    globals().pop('i')
    globals().pop('disposable')

except Exception as e:
    logError("unknown", e)
