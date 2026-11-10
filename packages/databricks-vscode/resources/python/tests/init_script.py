"""Loads 00-databricks-init.py for the tests, without IPython.

The startup script imports IPython at the top and decorates its magics with
IPython's decorators. The tests stand those in, so they run on any Python 3
without IPython installed, and `DATABRICKS_EXTENSION_UNIT_TESTS` stops the
script's `setup()` from running on import.
"""
import os
import sys
import types
from importlib.util import module_from_spec, spec_from_file_location

HERE = os.path.dirname(os.path.abspath(__file__))
RESOURCES = os.path.dirname(HERE)
INIT_SCRIPT = os.path.join(RESOURCES, "00-databricks-init.py")


def _install_fake_ipython():
    if "IPython" in sys.modules:
        return
    ipython = types.ModuleType("IPython")
    ipython.get_ipython = lambda: None
    display = types.ModuleType("IPython.display")
    display.display = lambda *args, **kwargs: None
    display.HTML = str
    core = types.ModuleType("IPython.core")
    magic = types.ModuleType("IPython.core.magic")
    identity = lambda f: f  # noqa: E731
    magic.magics_class = identity
    magic.line_magic = identity
    magic.needs_local_scope = identity
    magic.Magics = object
    for name, module in {
        "IPython": ipython,
        "IPython.display": display,
        "IPython.core": core,
        "IPython.core.magic": magic,
    }.items():
        sys.modules[name] = module


def load_init_script():
    _install_fake_ipython()
    os.environ["DATABRICKS_EXTENSION_UNIT_TESTS"] = "1"
    spec = spec_from_file_location("init_module", INIT_SCRIPT)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
