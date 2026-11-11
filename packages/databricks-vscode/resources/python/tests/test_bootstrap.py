"""Tests for bootstrap.py and the workflow wrappers (run by features/run/python.test.ts).

The scripts run on a cluster, where Databricks defines `spark`, `dbutils`
and the other globals. Here they run with stand-ins, in a temporary folder
whose path has spaces, so only the parts the extension controls are tested:
how the arguments are read, the working directory, sys.path, argv, env and
the error envelope. Plain unittest, so any Python 3 runs them.
"""
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
RESOURCES = os.path.dirname(HERE)
BOUNDARY = "__DATABRICKS_VSCODE_STDOUT_ERROR_BOUNDARY__"

with open(os.path.join(RESOURCES, "bootstrap.py")) as f:
    BOOTSTRAP = f.read()
with open(os.path.join(RESOURCES, "file.workflow-wrapper.py")) as f:
    FILE_WRAPPER = f.read()


def databricks_globals():
    """Stand-ins for what a Databricks REPL defines."""
    names = ["display", "displayHTML", "dbutils", "table", "sql", "udf", "getArgument", "sc", "spark", "sqlContext"]
    return {name: object() for name in names}


def bootstrap_command(config):
    """What features/run/bootstrap.ts sends: one line with the JSON string, then the script."""
    return "__databricks_bootstrap_config = " + json.dumps(json.dumps(config)) + "\n" + BOOTSTRAP


class Sandbox(unittest.TestCase):
    def setUp(self):
        self.cwd = os.getcwd()
        self.path = list(sys.path)
        self.argv = list(sys.argv)
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="databricks vscode "))
        self.project = os.path.join(self.root, "my project")
        os.makedirs(os.path.join(self.project, "nested dir"))
        self.write("lib.py", "def greet():\n    print('hello from lib')\n")

    def tearDown(self):
        os.chdir(self.cwd)
        sys.path[:] = self.path
        sys.argv[:] = self.argv
        os.environ.pop("DATABRICKS_TEST_VAR", None)
        sys.modules.pop("lib", None)
        shutil.rmtree(self.root)

    def write(self, relative, content):
        path = os.path.join(self.project, relative)
        with open(path, "w") as f:
            f.write(content)
        return path

    def run_command(self, command):
        out = io.StringIO()
        with redirect_stdout(out):
            exec(compile(command, "<command--1>", "exec"), databricks_globals())
        return out.getvalue()


class BootstrapTest(Sandbox):
    def config(self, program, args=(), env=None):
        return {
            "python_file": program,
            "repo_path": self.project,
            "args": [program] + list(args),
            "env": env or {},
            "stdout_error_boundary": BOUNDARY,
        }

    def test_reads_its_arguments_from_json(self):
        program = self.write(
            os.path.join("nested dir", "hello.py"),
            "import os, sys\n"
            "from lib import greet\n"
            "greet()\n"
            "print('cwd=' + os.getcwd())\n"
            "print('argv=' + repr(sys.argv[1:]))\n"
            "print('env=' + os.environ['DATABRICKS_TEST_VAR'])\n"
            "print('spark' in globals())\n",
        )
        args = ["--name", "it's \"quoted\" \\ and spaced"]
        output = self.run_command(bootstrap_command(self.config(program, args, {"DATABRICKS_TEST_VAR": "a 'b' \"c\""})))
        self.assertIn("hello from lib", output)
        self.assertIn("cwd=" + os.path.join(self.project, "nested dir"), output)
        self.assertIn("argv=" + repr(args), output)
        self.assertIn("env=a 'b' \"c\"", output)
        self.assertIn("True", output)

    def test_sends_printed_output_then_the_error_envelope(self):
        program = self.write("fails.py", "print('before')\nraise ValueError('boom')\n")
        output = self.run_command(bootstrap_command(self.config(program)))
        stdout, payload = output.split("\n" + BOUNDARY + "\n")
        self.assertEqual(stdout, "before\n")
        envelope = json.loads(payload)
        self.assertEqual(envelope["type"], "ValueError")
        self.assertEqual(envelope["message"], "boom")
        self.assertEqual(envelope["frames"][0]["file"], program)
        self.assertEqual(envelope["frames"][-1]["line"], 2)

    def test_raises_natively_when_nothing_was_printed(self):
        program = self.write("fails.py", "raise KeyError('k')\n")
        with self.assertRaises(KeyError):
            self.run_command(bootstrap_command(self.config(program)))


class FileWrapperTest(Sandbox):
    def test_runs_the_file_from_its_folder_with_the_project_on_sys_path(self):
        program = self.write(
            os.path.join("nested dir", "job.py"),
            "import os\nfrom lib import greet\ngreet()\nprint('cwd=' + os.getcwd())\n",
        )
        # The substitution features/run/workflowWrappers.ts makes. It substitutes workspace
        # paths, which have `/`: a Windows path's `\` would be an escape in the string literal.
        wrapper = FILE_WRAPPER.replace("{{DATABRICKS_SOURCE_FILE}}", program.replace(os.sep, "/")).replace(
            "{{DATABRICKS_PROJECT_ROOT}}", self.project.replace(os.sep, "/")
        )
        output = self.run_command(wrapper)
        self.assertIn("hello from lib", output)
        self.assertIn("cwd=" + os.path.join(self.project, "nested dir"), output)


if __name__ == "__main__":
    unittest.main()
