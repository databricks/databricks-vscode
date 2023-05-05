from databricks.connect import DatabricksSession
from databricks.sdk import WorkspaceClient
from IPython import get_ipython
from pyspark.sql.connect.dataframe import DataFrame
from typing import List
import warnings
from IPython.core.magic import magics_class, Magics, line_magic, needs_local_scope
import shlex
import os


@magics_class
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
                    list(filter(lambda i: not i.startswith("_"), dbutils.fs.__dir__()))
                )
            )
        cmd = dbutils.fs.__getattribute__(cmd_str)
        return cmd(*args[1:])


def main():
    spark = DatabricksSession.builder.getOrCreate()
    dbutils = WorkspaceClient().dbutils

    remote_blocked_cell_magics = ["%%sh"]
    local_blocked_line_as_cell_magics = ["r", "scala"]

    def is_cell_magic(lines: List[str]):
        def handle(lines: List[str]):
            cell_magic = is_cell_magic(lines)
            if cell_magic in remote_blocked_cell_magics:
                warnings.warn(
                    "%%"
                    + cell_magic
                    + " is not supported on Databricks. This notebook might fail when running on a Databricks cluster. Consider using %"
                    + cell_magic
                    + " instead."
                )

            return lines

        is_cell_magic.handle = handle
        if len(lines) == 0:
            return
        if lines[0].startswith("%%"):
            return lines[0].split(" ")[0].strip().strip("%")

    def is_line_as_cell_magic(lines: List[str]):
        def handle(lines: List[str]):
            line_as_cell_magic = is_line_as_cell_magic(lines)
            if line_as_cell_magic in local_blocked_line_as_cell_magics:
                raise NotImplementedError(
                    "%"
                    + line_as_cell_magic
                    + " is not supported for local Databricks Notebooks."
                )

            if line_as_cell_magic == "md" or line_as_cell_magic == "md-sandbox":
                lines[0] = (
                    "%%markdown" + lines[0].partition("%" + line_as_cell_magic)[2]
                )
                return lines

            if line_as_cell_magic == "sh":
                lines[0] = "%%sh" + lines[0].partition("%" + line_as_cell_magic)[2]
                return lines

            if line_as_cell_magic == "sql":
                lines = lines[1:]
                spark_string = (
                    "global _sqldf\n"
                    + "_sqldf = spark.sql('''"
                    + "".join(lines)
                    + "''')\n"
                    + "_sqldf"
                )
                return spark_string.splitlines(keepends=True)

            if line_as_cell_magic == "python":
                return lines[1:]

            return lines

        is_line_as_cell_magic.handle = handle
        if len(lines) == 0:
            return
        if lines[0].startswith("%"):
            return lines[0].split(" ")[0].strip().strip("%")

    def parse_line_for_databricks(lines: List[str]):
        for magic_check in [is_cell_magic, is_line_as_cell_magic]:
            if magic_check(lines):
                return magic_check.handle(lines)

        return lines

    def df_html(df):
        return df.limit(20).toPandas().to_html()

    ip = get_ipython()
    ip.register_magics(DatabricksMagics)
    ip.input_transformers_cleanup.append(parse_line_for_databricks)
    html_formatter = get_ipython().display_formatter.formatters["text/html"]
    html_formatter.for_type(DataFrame, df_html)

    try:
        import matplotlib

        ip.run_line_magic("matplotlib", "inline")
    except:
        pass

    try:
        root_path = os.environ["DATABRICKS_PROJECT_ROOT"]
        import sys

        sys.path.append(root_path)
    except:
        pass

    return spark, dbutils

global _sqldf

try:
    spark, dbutils = main()
except Exception as e:
    warnings.warn("Error initialising databricks globals. " + str(e))
