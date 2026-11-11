"""How 00-databricks-init.py reads a Databricks notebook source for `%run`.

`is_databricks_notebook` checks the header line, and
`convert_databricks_notebook_to_ipynb` splits the file into cells. Both read
a Python source file, which is UTF-8 (PEP 3120) whatever the locale is.
"""
import io
import json
import os
import shutil
import tempfile
import unittest

from init_script import load_init_script

init_module = load_init_script()


def windows_open(file, mode="r", buffering=-1, encoding=None, *args, **kwargs):
    """`open` as on Windows before Python 3.15: text is cp1252 unless told otherwise."""
    if "b" not in mode and encoding is None:
        encoding = "cp1252"
    return io.open(file, mode, buffering, encoding, *args, **kwargs)


class RunNotebooks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="run notebooks ")
        self.notebook = os.path.join(self.tmp, "nb.py")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_reads_a_notebook_source_as_utf8_on_windows(self):
        source = "# Databricks notebook source\nprint('Jürgen')\n\n# COMMAND ----------\n\n# MAGIC %md café\n"
        with open(self.notebook, "wb") as f:
            f.write(source.encode("utf-8"))

        init_module.open = windows_open
        try:
            self.assertTrue(init_module.is_databricks_notebook(self.notebook))
            cells = json.loads(init_module.convert_databricks_notebook_to_ipynb(self.notebook))["cells"]
        finally:
            del init_module.open

        sources = [cell["source"] for cell in cells]
        self.assertIn("# Databricks notebook source\nprint('Jürgen')", sources)
        self.assertIn("%md café", sources)

    def test_reads_a_notebook_source_in_the_encoding_its_coding_cookie_declares(self):
        # PEP 263: a cookie on the first two lines says how the file is encoded.
        source = "# Databricks notebook source\n# -*- coding: cp1252 -*-\nprint('caf\u00e9')\n"
        with open(self.notebook, "wb") as f:
            f.write(source.encode("cp1252"))

        self.assertTrue(init_module.is_databricks_notebook(self.notebook))
        cells = json.loads(init_module.convert_databricks_notebook_to_ipynb(self.notebook))["cells"]

        self.assertIn("print('caf\u00e9')", cells[-1]["source"])


if __name__ == "__main__":
    unittest.main()
