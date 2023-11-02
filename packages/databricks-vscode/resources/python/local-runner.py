import os
from databricks.connect import DatabricksSession

source_file = os.environ.get("DATABRICKS_SOURCE_FILE", "")

spark = DatabricksSession.builder.getOrCreate()

from runpy import run_path

run_path(source_file, run_name="__main__", init_globals={"spark": spark})
