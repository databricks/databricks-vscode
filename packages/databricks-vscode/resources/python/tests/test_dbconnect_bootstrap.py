"""Tests for dbconnect-bootstrap.py (run by features/run/python.test.ts).

The bootstrap runs a user's file locally with Databricks Connect. Here it runs
in a subprocess with stand-in `databricks` and `pyspark` packages, in a
project whose path has spaces, and reads an env file that is one of the
golden files `EnvFile.test.ts` checks the TypeScript writer against, so the
writer and this reader share one contract. Plain unittest, so any Python 3
runs them.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
RESOURCES = os.path.dirname(HERE)
BOOTSTRAP = os.path.join(RESOURCES, "dbconnect-bootstrap.py")
GOLDEN = os.path.join(
    RESOURCES, "..", "..", "src", "features", "python", "fixtures", "env-file", "pat.cluster.env"
)

STUBS = {
    "databricks/__init__.py": "",
    "databricks/sdk/__init__.py": "",
    "databricks/sdk/runtime.py": "dbutils = 'stub-dbutils'\n",
    "databricks/connect.py": (
        "class _Session:\n"
        "    def sql(self, query):\n"
        "        return 'sql:' + query\n"
        "class _Builder:\n"
        "    def getOrCreate(self):\n"
        "        return _Session()\n"
        "class DatabricksSession:\n"
        "    builder = _Builder()\n"
    ),
    "pyspark/__init__.py": "",
    "pyspark/sql/__init__.py": "functions = 'stub-functions'\nclass SparkSession:\n    pass\n",
}

SCRIPT = """
import json, os, sys
names = ["DATABRICKS_HOST", "DATABRICKS_CONFIG_PROFILE", "DATABRICKS_CLUSTER_ID", "DATABRICKS_ENV_FILE_VERSION",
         "DATABRICKS_TOKEN", "DATABRICKS_CLIENT_SECRET", "DATABRICKS_SERVERLESS_COMPUTE_ID", "DATABRICKS_SOURCE_FILE",
         "DATABRICKS_PROJECT_ROOT"]
out = {
    "env": {n: os.environ.get(n) for n in names},
    "name": __name__,
    "argv": sys.argv,
    "cwd": os.getcwd(),
    "path": sys.path[:2],
    "spark": spark.sql("SELECT 1") if "spark" in globals() else None,
    "dbutils": globals().get("dbutils"),
    "udf": globals().get("udf"),
}
with open(sys.argv[1], "w") as f:
    json.dump(out, f)
"""

# Text files open as cp1252 by default, as on Windows before Python 3.15.
WINDOWS_OPEN = """
import builtins, io
def _open(file, mode="r", buffering=-1, encoding=None, *args, **kwargs):
    if "b" not in mode and encoding is None:
        encoding = "cp1252"
    return io.open(file, mode, buffering, encoding, *args, **kwargs)
builtins.open = _open
"""


def write(root, relative, content):
    path = os.path.join(root, relative)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return path


class DbConnectBootstrap(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="dbconnect bootstrap ")
        self.project = os.path.join(self.tmp, "my project")
        self.stubs = os.path.join(self.tmp, "stubs")
        for relative, content in STUBS.items():
            write(self.stubs, relative, content)
        os.makedirs(os.path.join(self.project, ".databricks"))
        shutil.copy(GOLDEN, os.path.join(self.project, ".databricks", ".databricks.env"))
        self.script = write(self.project, os.path.join("nested dir", "hello.py"), SCRIPT)
        self.output = os.path.join(self.tmp, "out.json")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_bootstrap(self, stubs=True):
        env = dict(os.environ)
        env["PYTHONPATH"] = self.stubs if stubs else ""
        # Ambient values the env file must override or unset.
        env["DATABRICKS_TOKEN"] = "dapi-ambient-secret"
        env["DATABRICKS_CLIENT_SECRET"] = "ambient-client-secret"
        env["DATABRICKS_SERVERLESS_COMPUTE_ID"] = "auto"
        env["DATABRICKS_HOST"] = "https://ambient.cloud.databricks.com"
        result = subprocess.run(
            [sys.executable, BOOTSTRAP, self.script, self.output],
            cwd=self.project,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
        )
        return result

    def read_output(self):
        with open(self.output) as f:
            return json.load(f)

    def test_applies_the_env_file(self):
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        env = self.read_output()["env"]
        self.assertEqual(env["DATABRICKS_HOST"], "https://adb-1234.azuredatabricks.net")
        self.assertEqual(env["DATABRICKS_CONFIG_PROFILE"], "DEFAULT")
        self.assertEqual(env["DATABRICKS_CLUSTER_ID"], "0123-456789-abc")
        self.assertEqual(env["DATABRICKS_ENV_FILE_VERSION"], "1")
        # A value with a space survives the split at the first "=".
        self.assertEqual(env["DATABRICKS_PROJECT_ROOT"], "/work/my project")

    def test_an_empty_value_unsets_the_ambient_variable(self):
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        env = self.read_output()["env"]
        self.assertIsNone(env["DATABRICKS_TOKEN"])
        self.assertIsNone(env["DATABRICKS_CLIENT_SECRET"])
        self.assertIsNone(env["DATABRICKS_SERVERLESS_COMPUTE_ID"])

    def test_runs_the_file_as_main_with_the_databricks_globals(self):
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        out = self.read_output()
        self.assertEqual(out["name"], "__main__")
        self.assertEqual(out["spark"], "sql:SELECT 1")
        self.assertEqual(out["dbutils"], "stub-dbutils")
        self.assertEqual(out["udf"], "stub-functions")
        self.assertEqual(out["env"]["DATABRICKS_SOURCE_FILE"], self.script)

    def test_argv_cwd_and_sys_path(self):
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        out = self.read_output()
        self.assertEqual(out["argv"], [self.script, self.output])
        self.assertEqual(os.path.realpath(out["cwd"]), os.path.realpath(self.project))
        # The file's folder first, then the project (where the env file was found).
        self.assertEqual(out["path"], [os.path.dirname(self.script), self.project])

    def test_reads_the_env_file_as_utf8_on_windows(self):
        # EnvFile.ts writes UTF-8, and Python on Windows opens text as cp1252
        # unless told otherwise. sitecustomize gives this interpreter that
        # default. A path with "\u00fc" must still come back as written, and so
        # must "#", "=", quotes and spaces, which the reader keeps as they are.
        write(self.stubs, "sitecustomize.py", WINDOWS_OPEN)
        root = "/home/J\u00fcrgen/my \"#1\" = 'project'"
        content = "DATABRICKS_HOST=https://h\nDATABRICKS_PROJECT_ROOT=" + root + "\n"
        with open(os.path.join(self.project, ".databricks", ".databricks.env"), "wb") as f:
            f.write(content.encode("utf-8"))
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.read_output()["env"]["DATABRICKS_PROJECT_ROOT"], root)

    def test_an_import_failure_logs_the_old_message(self):
        os.remove(os.path.join(self.stubs, "databricks", "connect.py"))
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Failed to import Databricks Connect", result.stderr)
        self.assertIn("standalone 'pyspark'", result.stderr)
        self.assertIsNone(self.read_output()["spark"])


if __name__ == "__main__":
    unittest.main()
