import os
import sys
import logging
from runpy import run_path

def load_env_from_leaf(path: str) -> bool:
    curdir = path if os.path.isdir(path) else os.path.dirname(path)
    env_file_path = os.path.join(curdir, ".databricks", ".databricks.env")
    if os.path.exists(env_file_path):
        with open(env_file_path, "r") as f:
            for line in f.readlines():
                key, value = line.strip().split("=", 1)
                os.environ[key] = value
        return curdir
    parent = os.path.dirname(curdir)
    if parent == curdir:
        return curdir
    return load_env_from_leaf(parent)

script = sys.argv[1]
sys.argv = sys.argv[1:]
logging.debug(f"Running ${script}")
logging.debug(f"args: ${sys.argv[1:]}")

try: 
    cur_dir = os.path.dirname(script)
except Exception as e:
    logging.error(f"Failed to get current directory: {e}")
    cur_dir = os.getcwd()

# Suppress grpc warnings coming from databricks-connect with newer version of grpcio lib
os.environ["GRPC_VERBOSITY"] = "NONE"

project_dir = load_env_from_leaf(cur_dir)

log_level = os.environ.get("DATABRICKS_VSCODE_LOG_LEVEL")
log_level = log_level if log_level is not None else "WARN"

logging.basicConfig(level=log_level)

db_globals = {}

from databricks.sdk.runtime import dbutils  # noqa: E402
db_globals['dbutils'] = dbutils

# "table", "sc", "sqlContext" are missing
try:
    from pyspark.sql import functions as udf, SparkSession
    from databricks.connect import DatabricksSession
    spark: SparkSession = DatabricksSession.builder.getOrCreate()
    sql = spark.sql
    db_globals['spark'] = spark
    db_globals['sql'] = sql
    db_globals['udf'] = udf
except Exception as e:
    logging.debug(f"Failed to create DatabricksSession: {e}")

# We do this to prevent importing widgets implementation prematurely
# The widget import should prompt users to use the implementation
# which has ipywidget support.
def getArgument(*args, **kwargs):
    return dbutils.widgets.getArgument(*args, **kwargs)

db_globals['getArgument'] = getArgument

sys.path.insert(0, project_dir)
sys.path.insert(0, cur_dir)

run_path(script, init_globals=db_globals, run_name="__main__")
