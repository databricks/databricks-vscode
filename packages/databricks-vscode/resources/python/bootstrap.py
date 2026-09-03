import runpy
import sys
import os
import io
import json
import traceback

# values will be injected by the runner
python_file = "PYTHON_FILE"
repo_path = "REPO_PATH"
args = []
env = {}
stdout_error_boundary = "STDOUT_ERROR_BOUNDARY"

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
try:
    import logging; logger = spark._jvm.org.apache.log4j;
    logging.getLogger("py4j.java_gateway").setLevel(logging.ERROR)
except Exception as e:
    logging.debug("Failed to set py4j.java_gateway log level to ERROR", exc_info=True)
    pass

# Capture the script's stdout while it runs. The 1.2 commands API returns only
# the traceback (and drops stdout) when a command ends in error, so to still
# surface output printed *before* a failure we buffer stdout and, on error,
# emit it followed by a structured traceback that the extension renders and
# remaps to local files. See DatabricksRuntime.ts / ErrorParser.ts.
_real_stdout = sys.stdout
_stdout_buffer = io.StringIO()
sys.stdout = _stdout_buffer
_handled = False
try:
    runpy.run_path(python_file, run_name="__main__", init_globals=user_ns)
except Exception:
    sys.stdout = _real_stdout
    _captured = _stdout_buffer.getvalue()
    if not _captured:
        # Nothing was printed before the failure: let the platform produce its
        # native (clickable) traceback exactly as before.
        raise
    _handled = True
    _exc_type, _exc_value, _exc_tb = sys.exc_info()
    _tb_frames = traceback.extract_tb(_exc_tb)
    # Drop bootstrap's own frames: keep the stack from the user's script onward.
    _start = 0
    for _i, _frame in enumerate(_tb_frames):
        if _frame.filename == python_file:
            _start = _i
            break
    _payload = {
        "type": _exc_type.__name__,
        "message": str(_exc_value),
        "frames": [
            {
                "file": _frame.filename,
                "line": _frame.lineno,
                "name": _frame.name,
                "text": _frame.line or "",
            }
            for _frame in _tb_frames[_start:]
        ],
    }
    sys.stdout.write(_captured)
    sys.stdout.write("\n" + stdout_error_boundary + "\n")
    sys.stdout.write(json.dumps(_payload))
finally:
    # Always restore stdout and replay the buffer unless we already emitted it
    # (e.g. on success, or when a BaseException such as SystemExit propagates).
    sys.stdout = _real_stdout
    if not _handled:
        sys.stdout.write(_stdout_buffer.getvalue())
None
