"""How 00-databricks-init.py applies the project's env file.

The startup script runs in every IPython kernel and looks for
`.databricks/.databricks.env` from the kernel's working folder up. It reads
one of the golden files `EnvFile.test.ts` checks the TypeScript writer
against, so the writer and this reader share one contract: an empty value
unsets the variable.
"""
import io
import os
import shutil
import sys
import tempfile
import types
import unittest

from init_script import RESOURCES, load_init_script

init_module = load_init_script()
GOLDEN = os.path.join(
    RESOURCES, "..", "..", "src", "features", "python", "fixtures", "env-file", "pat.cluster.env"
)


class InitScriptEnv(unittest.TestCase):
    def setUp(self):
        self.environ = dict(os.environ)
        self.tmp = tempfile.mkdtemp(prefix="init script ")
        self.project = os.path.join(self.tmp, "my project")
        self.nested = os.path.join(self.project, "nested dir")
        os.makedirs(self.nested)
        os.makedirs(os.path.join(self.project, ".databricks"))
        self.env_file = os.path.join(self.project, ".databricks", ".databricks.env")

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.environ)
        shutil.rmtree(self.tmp)

    def test_applies_the_golden_env_file_from_a_nested_folder(self):
        shutil.copy(GOLDEN, self.env_file)
        os.environ["DATABRICKS_TOKEN"] = "ambient-token"
        os.environ["DATABRICKS_CLIENT_SECRET"] = "ambient-secret"

        self.assertTrue(init_module.load_env_from_leaf(self.nested))

        self.assertEqual(os.environ["DATABRICKS_HOST"], "https://adb-1234.azuredatabricks.net")
        self.assertEqual(os.environ["DATABRICKS_CONFIG_PROFILE"], "DEFAULT")
        self.assertEqual(os.environ["DATABRICKS_CLUSTER_ID"], "0123-456789-abc")
        self.assertEqual(os.environ["DATABRICKS_PROJECT_ROOT"], "/work/my project")
        self.assertEqual(os.environ["DATABRICKS_ENV_FILE_VERSION"], "1")
        # Empty values unset: ambient credentials don't reach the kernel.
        self.assertNotIn("DATABRICKS_TOKEN", os.environ)
        self.assertNotIn("DATABRICKS_CLIENT_SECRET", os.environ)
        self.assertNotIn("DATABRICKS_SERVERLESS_COMPUTE_ID", os.environ)

    def test_reads_the_project_root_and_progress_flag_through_the_config(self):
        shutil.copy(GOLDEN, self.env_file)
        init_module.load_env_from_leaf(self.nested)
        cfg = init_module.LocalDatabricksNotebookConfig()
        self.assertEqual(cfg.project_root, "/work/my project")
        self.assertIs(cfg.show_progress, True)
        self.assertEqual(cfg.dataframe_display_limit, 20)

    def test_skips_blank_lines_and_lines_without_a_value_separator(self):
        with open(self.env_file, "w") as f:
            f.write("\nDATABRICKS_HOST=https://h\n\nnot a variable\nX=a=b\n")
        self.assertTrue(init_module.load_env_from_leaf(self.nested))
        self.assertEqual(os.environ["DATABRICKS_HOST"], "https://h")
        self.assertEqual(os.environ["X"], "a=b")

    def test_reads_the_env_file_as_utf8_on_windows(self):
        # A kernel on Windows opens text as cp1252 unless told otherwise; EnvFile.ts writes UTF-8.
        root = "/home/J\u00fcrgen/my \"#1\" = 'project'"
        with open(self.env_file, "wb") as f:
            f.write(("DATABRICKS_PROJECT_ROOT=" + root + "\n").encode("utf-8"))

        def windows_open(file, mode="r", buffering=-1, encoding=None, *args, **kwargs):
            if "b" not in mode and encoding is None:
                encoding = "cp1252"
            return io.open(file, mode, buffering, encoding, *args, **kwargs)

        init_module.open = windows_open
        try:
            self.assertTrue(init_module.load_env_from_leaf(self.nested))
        finally:
            del init_module.open
        self.assertEqual(os.environ["DATABRICKS_PROJECT_ROOT"], root)

    def test_returns_false_without_an_env_file(self):
        lonely = tempfile.mkdtemp(prefix="no env ")
        try:
            self.assertFalse(init_module.load_env_from_leaf(lonely))
        finally:
            shutil.rmtree(lonely)



def write_env_file(project, *lines):
    """The project's env file, one KEY=value per line, as `EnvFile.ts` writes it."""
    os.makedirs(os.path.join(project, ".databricks"), exist_ok=True)
    with open(os.path.join(project, ".databricks", ".databricks.env"), "w", encoding="utf-8") as f:
        f.write("".join(line + "\n" for line in lines))


def fake_databricks_modules(sessions):
    """Stand-ins for the packages a kernel imports; `sessions` collects each session the script starts."""
    class FakeBuilder:
        def getOrCreate(builder):
            sessions.append("session")
            return types.SimpleNamespace(sql=lambda text: text)

    fake_connect = types.ModuleType("databricks.connect")
    fake_connect.DatabricksSession = types.SimpleNamespace(builder=FakeBuilder())
    fake_runtime = types.ModuleType("databricks.sdk.runtime")
    fake_runtime.dbutils = types.SimpleNamespace(
        widgets=types.SimpleNamespace(getArgument=lambda *a, **k: None))
    fake_sql = types.ModuleType("pyspark.sql")
    fake_sql.functions = types.ModuleType("pyspark.sql.functions")
    fake_sql.SparkSession = object
    return {
        "databricks": types.ModuleType("databricks"),
        "databricks.connect": fake_connect,
        "databricks.sdk": types.ModuleType("databricks.sdk"),
        "databricks.sdk.runtime": fake_runtime,
        "pyspark": types.ModuleType("pyspark"),
        "pyspark.sql": fake_sql,
    }


class DefaultComputeKernel(unittest.TestCase):
    """The startup script's session for a project whose compute is only the default (no choice)."""

    GLOBALS = ("spark", "sql", "dbutils", "getArgument", "displayHTML", "udf")

    def setUp(self):
        from unittest import mock
        self.environ = dict(os.environ)
        self.sessions = []
        self.patch = mock.patch.dict(sys.modules, fake_databricks_modules(self.sessions))
        self.patch.start()
        for name in self.GLOBALS:
            init_module.__dict__.pop(name, None)

    def tearDown(self):
        self.patch.stop()
        for name in self.GLOBALS:
            init_module.__dict__.pop(name, None)
        os.environ.clear()
        os.environ.update(self.environ)

    def test_the_marker_is_read_only_when_it_is_one(self):
        os.environ.pop("DATABRICKS_SERVERLESS_COMPUTE_DEFAULT", None)
        self.assertFalse(init_module.serverless_default_only())
        os.environ["DATABRICKS_SERVERLESS_COMPUTE_DEFAULT"] = "0"
        self.assertFalse(init_module.serverless_default_only())
        os.environ["DATABRICKS_SERVERLESS_COMPUTE_DEFAULT"] = "1"
        self.assertTrue(init_module.serverless_default_only())

    def test_starts_the_session_and_defines_spark_by_default(self):
        init_module.create_and_register_databricks_globals(start_session=True)
        self.assertEqual(self.sessions, ["session"])
        self.assertIn("spark", init_module.__dict__)
        self.assertIn("sql", init_module.__dict__)

    def test_starts_no_session_for_the_default_and_keeps_the_rest(self):
        init_module.create_and_register_databricks_globals(start_session=False)
        self.assertEqual(self.sessions, [])
        # The stand-in: any use of it says why there is no session.
        self.assertIsInstance(init_module.__dict__.get("spark"), init_module._NoComputeSession)
        for name in ("dbutils", "getArgument", "displayHTML", "udf"):
            self.assertIn(name, init_module.__dict__)

    def test_the_stand_in_fails_with_the_plain_message_on_use(self):
        init_module.create_and_register_databricks_globals(start_session=False)
        with self.assertRaises(AttributeError) as spark_use:
            init_module.spark.range(1)
        self.assertEqual(str(spark_use.exception), init_module.NO_COMPUTE_MESSAGE)
        with self.assertRaises(RuntimeError) as sql_use:
            init_module.sql("select 1")
        self.assertEqual(str(sql_use.exception), init_module.NO_COMPUTE_MESSAGE)
        with self.assertRaises(RuntimeError):
            init_module.spark("select 1")

    def test_the_stand_in_answers_hasattr_and_getattr_like_an_object_without_the_attribute(self):
        init_module.create_and_register_databricks_globals(start_session=False)
        spark = init_module.spark
        self.assertFalse(hasattr(spark, "range"))
        self.assertIsNone(getattr(spark, "range", None))
        # Private and dunder names: the normal answer, so IPython's introspection works.
        self.assertIsNone(getattr(spark, "_repr_html_", None))
        self.assertFalse(hasattr(spark, "__len__"))
        with self.assertRaises(AttributeError) as private:
            spark._repr_html_
        self.assertEqual(str(private.exception), "_repr_html_")
        self.assertIsInstance(repr(spark), str)


class DefaultComputeSetup(unittest.TestCase):
    """`setup()` in a project whose env file carries the marker: what the kernel starts with.

    `setup()` pops the module's own helpers when it ends, so each test runs it on a fresh copy.
    """

    def setUp(self):
        import contextlib
        from unittest import mock
        self.environ = dict(os.environ)
        self.sessions = []
        self.module = load_init_script()
        self.patch = mock.patch.dict(
            sys.modules, {**fake_databricks_modules(self.sessions), "init_module": self.module})
        self.patch.start()
        # setup() appends the project to sys.path (update_sys_path); each test gets its own.
        self.sys_path = list(sys.path)
        self.cwd = os.getcwd()
        self.project = tempfile.mkdtemp(prefix="default compute ")
        write_env_file(
            self.project,
            "DATABRICKS_PROJECT_ROOT=" + self.project,
            "DATABRICKS_SERVERLESS_COMPUTE_ID=auto",
            "DATABRICKS_SERVERLESS_COMPUTE_DEFAULT=1",
        )
        os.chdir(self.project)
        self.stderr = io.StringIO()
        self.redirect = contextlib.redirect_stderr(self.stderr)
        self.redirect.__enter__()

    def tearDown(self):
        self.redirect.__exit__(None, None, None)
        self.patch.stop()
        sys.path[:] = self.sys_path
        os.chdir(self.cwd)
        shutil.rmtree(self.project)
        os.environ.clear()
        os.environ.update(self.environ)

    def test_setup_with_the_marker_starts_no_session_and_says_why(self):
        self.module.setup()
        self.assertEqual(self.sessions, [])
        self.assertIsInstance(self.module.__dict__.get("spark"), self.module._NoComputeSession)
        self.assertIn(self.module.NO_COMPUTE_MESSAGE + "\n", self.stderr.getvalue())

    def test_setup_without_the_marker_starts_the_session(self):
        write_env_file(
            self.project,
            "DATABRICKS_PROJECT_ROOT=" + self.project,
            "DATABRICKS_SERVERLESS_COMPUTE_ID=auto",
        )
        self.module.setup()
        self.assertEqual(self.sessions, ["session"])
        self.assertNotIn("no Spark session was started", self.stderr.getvalue())

    def test_the_stand_in_fails_with_the_plain_message_after_setup(self):
        self.module.setup()
        with self.assertRaises(AttributeError) as spark_use:
            self.module.__dict__["spark"].range(1)
        self.assertEqual(str(spark_use.exception), self.module.NO_COMPUTE_MESSAGE)
        self.assertIn("dbutils", self.module.__dict__)


if __name__ == "__main__":
    unittest.main()
