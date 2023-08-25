import inspect
import os
import pkgutil
import importlib
import random
import shutil
import sys

class Dltutils:

    def __init__(self) -> None:
        self.notebook_dependencies = {}
        self.sessions = {}

    def get_graph(self, source_path):
        path = prepare_files_for_parse(source_path)
        deps = importModule(path)  
        self.notebook_dependencies[source_path] = deps
        return deps.getDependencies()
        
    # Runs all graph until a function
    def runUntil(self, source_path, func_name):
        if source_path not in self.notebook_dependencies:
            self.get_graph(source_path)
        deps = self.notebook_dependencies[source_path]
        ##TODO
        pass

    # Runs a function without caring about dependencies
    def run(self, source_path, func_name):
        path = prepare_files_for_run(source_path)
        df = runFunction(path, func_name)
        self.sessions[func_name] = df
        return df






def prepare_files_for_run(source_path):
    return prepare_files(source_path, 'runner')



def prepare_files(source_path, type):
    randomName = random.randint(1, 10000)
    base_dir = "/tmp"
    dir_path = "{0}/dlt{1}".format(base_dir, randomName)
    module_path = "{0}/notebook".format(dir_path, randomName)
    file_path = "{0}/nt.py".format(module_path)
    init_path = "{0}/__init__.py".format(module_path)
    os.makedirs(module_path, exist_ok=True)
    shutil.copy("./{0}/dlt.py".format(type), "{0}/dlt.py".format(module_path))
    shutil.copy(source_path, file_path)

    open(init_path, "w").close()
    return module_path




def prepare_files_for_parse(source_path):
    return prepare_files(source_path, 'parser')




def prepare_files_run(source_path):
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
    

    deco = dlt.DLTDecorator()
    del nt, dlt
    sys.path.remove(path)
    
    return deco


def runFunction(path, func_name):
    sys.path.append(path)
    dataframe = None
    import nt, dlt
    all_functions = inspect.getmembers(nt, inspect.isfunction)
    for key, value in all_functions:
        if key == func_name:
            dataframe = value()
    
    del nt, dlt
    sys.path.remove(path)
    
    return dataframe

   
   

    