import sys
import os
import unittest
import warnings
sys.dont_write_bytecode = True
from unittest.mock import patch

# Add the resources directory to the path so we can import the transformer
resources_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../resources/python'))
sys.path.append(resources_dir)

# Import from the init file
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location("init_module", os.path.join(resources_dir, "00-databricks-init.py"))
init_module = module_from_spec(spec)
spec.loader.exec_module(init_module)

# Get the relevant classes/functions
create_databricks_magics_transformer = init_module.create_databricks_magics_transformer
LocalDatabricksNotebookConfig = init_module.LocalDatabricksNotebookConfig
EnvLoader = init_module.EnvLoader

class MockConfig:
    """Mock configuration for testing"""
    def __init__(self):
        self.project_root = "/mock/project/root"

class TestDatabricksMagicsTransformer(unittest.TestCase):
    def setUp(self):
        self.config = MockConfig()
        self.transformer = create_databricks_magics_transformer(self.config)

    def test_no_magic(self):
        """Test that regular code without magics is not transformed"""
        code = ["print('Hello, world!')\n", "x = 5"]
        result = self.transformer(code)
        self.assertEqual(result, code)

    def test_md_magic(self):
        """Test that %md is transformed to %%markdown"""
        code = ["%md\n", "# This is markdown\n", "Some text"]
        expected = ["%%markdown\n", "# This is markdown\n", "Some text"]
        result = self.transformer(code)
        self.assertEqual(result, expected)

    def test_md_sandbox_magic(self):
        """Test that %md-sandbox is transformed to %%markdown"""
        code = ["%md-sandbox\n", "# This is markdown with sandbox"]
        expected = ["%%markdown\n", "# This is markdown with sandbox"]
        result = self.transformer(code)
        self.assertEqual(result, expected)

    def test_sh_magic(self):
        """Test that %sh is transformed to %%sh"""
        code = ["%sh\n", "ls -la\n", "echo 'hello'"]
        expected = ["%%sh\n", "ls -la\n", "echo 'hello'"]
        result = self.transformer(code)
        self.assertEqual(result, expected)

    def test_python_magic(self):
        """Test that %python prefix is removed"""
        code = ["%python\n", "x = 5\n", "print(x)"]
        expected = ["x = 5\n", "print(x)"]
        result = self.transformer(code)
        self.assertEqual(result, expected)

    def test_sql_magic(self):
        """Test that %sql is transformed to SQL execution code"""
        code = ["%sql\n", "SELECT * FROM table1;\n", "SELECT * FROM table2"]
        result = self.transformer(code)
        # Check that result starts with global _sqldf
        self.assertTrue(result[0].startswith("global _sqldf"))
        # Check that both SQL statements are included
        self.assertTrue(any("spark.sql('''SELECT * FROM table1'''" in line for line in result))
        self.assertTrue(any("spark.sql('''SELECT * FROM table2'''" in line for line in result))
        # Check that the result ends with _sqldf
        self.assertEqual(result[-1], "_sqldf")

    @patch('os.path.exists')
    def test_run_magic(self, mock_exists):
        """Test that %run is properly transformed"""
        mock_exists.return_value = True
        code = ["%run \\User\\hello.py param1=value1"]
        result = self.transformer(code)
        self.assertEqual(result[0], "with databricks_notebook_exec_env(r'/mock/project/root', r'\\User\\hello.py') as file:\n")
        self.assertEqual(result[1], "\t%run -i {file} param1=value1\n")

    @patch('os.path.exists')
    def test_run_magic_with_quotes(self, mock_exists):
        """Test that %run is properly transformed for paths wrapped in quotes"""
        mock_exists.return_value = True
        code = ["%run '/path/to/notebook.py' param1=value1"]
        result = self.transformer(code)
        self.assertEqual(result[0], "with databricks_notebook_exec_env(r'/mock/project/root', r'/path/to/notebook.py') as file:\n")
        self.assertEqual(result[1], "\t%run -i {file} param1=value1\n")

    def test_unsupported_magic(self):
        """Test that unsupported magics raise NotImplementedError"""
        unsupported_magics = ["%r", "%scala"]
        for magic in unsupported_magics:
            with self.assertRaises(NotImplementedError):
                self.transformer([f"{magic}\n", "some code\n"])

    def test_cell_magic_warning(self):
        """Test that certain cell magics emit warnings"""
        with warnings.catch_warnings(record=True) as w:
            # Trigger warning
            self.transformer(["%%sh\n", "echo 'hello'\n"])
            # Check warning was emitted
            self.assertEqual(len(w), 1)
            self.assertTrue("%%sh is not supported on Databricks" in str(w[0].message))
            self.assertTrue("Consider using %sh" in str(w[0].message))

    def test_strip_hash_magic(self):
        """Test that # MAGIC prefixes are stripped"""
        code = ["# MAGIC %md\n", "# MAGIC # Header\n", "# MAGIC Some text"]
        result = self.transformer(code)
        expected = ["%%markdown\n", "# Header\n", "Some text"]
        self.assertEqual(result, expected)

    def test_command_separator_ignored(self):
        """Test that # COMMAND ---------- is ignored"""
        code = ["print('before')\n", "# COMMAND ----------\n", "print('after')"]
        expected = ["print('before')\n", "print('after')"]
        result = self.transformer(code)
        self.assertEqual(result, expected)
        
    def test_dbtitle_ignored(self):
        """Test that # DBTITLE lines are ignored"""
        code = ["# DBTITLE 1,My Title\n", "print('code')"]
        expected = ["print('code')"]
        result = self.transformer(code)
        self.assertEqual(result, expected)

if __name__ == '__main__':
    unittest.main()
