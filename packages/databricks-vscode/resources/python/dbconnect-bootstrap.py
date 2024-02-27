import os

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

load_env_from_leaf(os.getcwd())

log_level = os.environ.get("DATABRICKS_VSCODE_LOG_LEVEL")
log_level = log_level if log_level is not None else "WARN"

import logging
logging.basicConfig(level=log_level)

db_globals = {}

from databricks.sdk.runtime import dbutils
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

db_globals['dbutils'] = dbutils
db_globals['spark'] = spark
db_globals['sql'] = sql
db_globals['getArgument'] = getArgument
db_globals['udf'] = udf

from runpy import run_path
import sys

script = sys.argv[1]
sys.argv = sys.argv[1:]
logging.debug(f"Running ${script}")
logging.debug(f"args: ${sys.argv[1:]}")

run_path(script, init_globals=db_globals, run_name="__main__")
