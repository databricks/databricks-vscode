import inspect
import os
import pkgutil
import importlib
import random
import shutil
import sys

def run(source_path):
    path = prepare_files(source_path)
    importModule(path)

def prepare_files(source_path):
    randomName = random.randint(1, 10000)
    base_dir = "/tmp"
    dir_path = "{0}/dlt{1}".format(base_dir, randomName)
    module_path = "{0}/notebook".format(dir_path, randomName)
    file_path = "{0}/nt.py".format(module_path)
    init_path = "{0}/__init__.py".format(module_path)
    os.makedirs(module_path, exist_ok=True)
    shutil.copy("./parser/dlt.py", "{0}/dlt.py".format(module_path))
    shutil.copy(source_path, file_path)

    open(init_path, "w").close()
    return module_path

def importModule(path):
    sys.path.append(path)
    import nt, dlt
    all_functions = inspect.getmembers(nt, inspect.isfunction)
    for key, value in all_functions:
        if str(inspect.signature(value)) == "(*args, **kwargs)":
            value()


    dlt.DLTDecorator().print()

   

    
# Test
path = "./test.py"
run(path)