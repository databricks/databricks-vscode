import runpy
import sys
import os

# values will be injected by the runner
python_file = "PYTHON_FILE"
repo_path = "REPO_PATH"
args = []
env = {}

# change working directory
os.chdir(os.path.dirname(python_file))

# update python path
sys.path.append(repo_path)
sys.path.append(os.path.dirname(python_file))

# inject command line arguments
sys.argv = args

# inject environment variables
for key in env:
    os.environ[key] = env[key]

# provide spark globals
user_ns = {
    "display": display,
    "displayHTML": displayHTML,
    "dbutils": dbutils,
    "table": table,
    "sql": sql,
    "udf": udf,
    "getArgument": getArgument,
    "sc": sc,
    "spark": spark,
    "sqlContext": sqlContext,
}

# Set log level to "ERROR". See https://kb.databricks.com/notebooks/cmd-c-on-object-id-p0.html
import logging; logger = spark._jvm.org.apache.log4j;
logging.getLogger("py4j.java_gateway").setLevel(logging.ERROR)

runpy.run_path(python_file, run_name="__main__", init_globals=user_ns)
None
