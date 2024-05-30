import os
import sys
import logging
from runpy import run_path

# Load environment variables from .databricks/.databricks.env
# We only look for the folder in the current working directory
# since for all commands laucnhed from root workspace
def load_env_file_from_cwd(path: str):
    if not os.path.isdir(path):
        return
    
    env_file_path = os.path.join(path, ".databricks", ".databricks.env")
    if not os.path.exists(os.path.dirname(env_file_path)):
        return
    
    with open(env_file_path, "r") as f:
        for line in f.readlines():
            key, value = line.strip().split("=", 1)
            os.environ[key] = value
    return


script = sys.argv[1]
sys.argv = sys.argv[1:]
logging.debug(f"Running ${script}")
logging.debug(f"args: ${sys.argv[1:]}")

try: 
    cur_dir = os.path.dirname(script)
except Exception as e:
    logging.error(f"Failed to get current directory: {e}")
    cur_dir = os.getcwd()

root_dir = os.getcwd()
load_env_file_from_cwd(root_dir)

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

sys.path.insert(0, root_dir)
sys.path.insert(0, cur_dir)

run_path(script, init_globals=db_globals, run_name="__main__")
