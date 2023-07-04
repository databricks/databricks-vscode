import os
import shlex
from IPython.core.magic import magics_class, Magics, line_magic, needs_local_scope
import warnings
from typing import List
from IPython import get_ipython
from databricks.connect import DatabricksSession
from pyspark.sql import SparkSession, functions as udf, DataFrame
from pyspark.sql.connect.dataframe import DataFrame as SparkConnectDataframe
import sys

__disposables = []


def disposable(f):
    if hasattr(f, '__name__'):
        __disposables.append(f.__name__)
    return f


@disposable
def create_and_register_databricks_globals():
    from databricks.sdk.runtime import dbutils
    from IPython.display import HTML

    # "table", "sc", "sqlContext" are missing
    spark: SparkSession = DatabricksSession.builder.getOrCreate()
    sql = spark.sql
    getArgument = dbutils.widgets.getArgument

    globals()['dbutils'] = dbutils
    globals()['spark'] = spark
    globals()['sql'] = sql
    globals()['getArgument'] = getArgument
    globals()['displayHTML'] = HTML


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
    project_root = EnvLoader("DATABRICKS_PROJECT_ROOT", required=True)
    dataframe_display_limit: int = EnvLoader("DATABRICKS_DF_DISPLAY_LIMIT", 20)

    def __new__(cls):
        annotations = cls.__dict__['__annotations__']
        for attr in annotations:
            cls.__dict__[attr].transform = annotations[attr]
        return object.__new__(cls)


@magics_class
@disposable
class DatabricksMagics(Magics):
    @line_magic
    def run(self, line):
        raise NotImplementedError(
            "%run is not supported for local Databricks Notebooks."
        )

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


@disposable
def register_magics():
    def warn_for_dbr_alternative(magic):
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

    def throw_if_not_supported(magic):
        # These are magics that are supported on dbr but not locally.
        unsupported_dbr_magics = ["%r", "%scala"]
        if magic in unsupported_dbr_magics:
            raise NotImplementedError(
                magic
                + " is not supported for local Databricks Notebooks."
            )

    def is_cell_magic(lines: List[str]):
        def handle(lines: List[str]):
            cell_magic = is_cell_magic(lines)
            warn_for_dbr_alternative(cell_magic)
            throw_if_not_supported(cell_magic)
            return lines

        is_cell_magic.handle = handle
        if len(lines) == 0:
            return
        if lines[0].startswith("%%"):
            return lines[0].split(" ")[0].strip()

    def is_line_magic(lines: List[str]):
        def handle(lines: List[str]):
            lmagic = is_line_magic(lines)
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

            return lines

        is_line_magic.handle = handle
        if len(lines) == 0:
            return
        if lines[0].startswith("%"):
            return lines[0].split(" ")[0].strip().strip("%")

    def parse_line_for_databricks_magics(lines: List[str]):
        if len(lines) == 0:
            return lines
        for magic_check in [is_cell_magic, is_line_magic]:
            if magic_check(lines):
                return magic_check.handle(lines)

        return lines

    ip = get_ipython()
    ip.register_magics(DatabricksMagics)
    ip.input_transformers_cleanup.append(parse_line_for_databricks_magics)


@disposable
def register_formatters(notebook_config: LocalDatabricksNotebookConfig):
    def df_html(df):
        return df.limit(notebook_config.dataframe_display_limit).toPandas().to_html()

    html_formatter = get_ipython().display_formatter.formatters["text/html"]
    html_formatter.for_type(SparkConnectDataframe, df_html)
    html_formatter.for_type(DataFrame, df_html)


@disposable
def update_sys_path(notebook_config: LocalDatabricksNotebookConfig):
    sys.path.append(notebook_config.project_root)


@disposable
def make_matplotlib_inline():
    try:
        import matplotlib
        get_ipython().run_line_magic("matplotlib", "inline")
    except:
        pass


global _sqldf

try:
    cfg = LocalDatabricksNotebookConfig()
    create_and_register_databricks_globals()
    register_magics()
    register_formatters(cfg)
    update_sys_path(cfg)
    make_matplotlib_inline()

    for i in __disposables + ['__disposables']:
        globals().pop(i)
    globals().pop('i')
    globals().pop('disposable')

except Exception as e:
    warnings.warn("Error initialising databricks globals. " + str(e))
