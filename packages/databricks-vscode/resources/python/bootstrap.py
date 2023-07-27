import runpy
import sys
import os

# values will be injected by the runner
python_file = "PYTHON_FILE"
repo_path = "REPO_PATH"
start_debugger = False
args = []
env = {}

if start_debugger:
    import debugpy
    import time

    # TODO: should be like this but the version in the DBR doesn't support it
    # debugpy.listen(5678, in_process_debug_adapter=True)
    # HACK: kill stranglers
    os.system("pkill -f debugpy")
    debugpy.listen(5678)

    # Wait for the debugger to attach, but timeout after 30 seconds
    timeout = 30
    start_time = time.monotonic()
    print("Waiting for debugger to attach...")
    while not debugpy.is_client_connected() and time.monotonic() - start_time < timeout:
        time.sleep(0.1)

    if not debugpy.is_client_connected():
        raise TimeoutError("Timed out waiting for debugger to attach")

# change working directory
os.chdir(os.path.dirname(python_file))

# update python path
sys.path.insert(0, repo_path)
sys.path.insert(0, os.path.dirname(python_file))

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
import logging

logger = spark._jvm.org.apache.log4j
logging.getLogger("py4j.java_gateway").setLevel(logging.ERROR)

runpy.run_path(python_file, run_name="__main__", init_globals=user_ns)
None
