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
        self.clean_imports(source_path)
        return deps.getDependencies()
        
    # Runs all graph until a function
    def runUntil(self, source_path, func_name):
        if source_path not in self.notebook_dependencies:
            self.get_graph(source_path)
        functions = [func_name]
        result = None
        while len(functions) != 0:
            possible_next = functions.pop()
            #dependencies
        return self.run(source_path, func_name)
        

    # Runs a function without caring about dependencies
    def run(self, source_path, func_name):
        if source_path not in self.notebook_dependencies:
            self.get_graph(source_path)
        path = self.prepare_files_for_run(source_path)
        df = self.runFunction(source_path, path, func_name)
        self.sessions[func_name] = df
        return df

    def clean_imports(self, source_path):
        if source_path not in self.sessions:
            return
        path = self.sessions[source_path]
        sys.path.append(path)
        import dlt
        importlib.reload(dlt)
        import nt
        importlib.reload(nt)
        del nt, dlt
        sys.path.remove(path)
        self.sessions.pop(source_path)
        return 


    def runFunction(self, source_path, path, func_name):
        sys.path.append(path)
        dataframe = None
        if source_path not in self.sessions:
            import dlt
            importlib.reload(dlt)
            import nt
            importlib.reload(nt)
            self.sessions[source_path] = path
        else:
            import dlt
            import nt
        all_functions = inspect.getmembers(nt, inspect.isfunction)
        print(all_functions)
        for key, value in all_functions:
            if key == func_name:
                dataframe = value()

        del nt, dlt
        sys.path.remove(path)
        
        
        return dataframe

    def prepare_files_for_run(self, source_path):
        if source_path in self.sessions:
            return self.sessions[source_path]
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


def importModule(path):
    sys.path.append(path)
    import dlt
    importlib.reload(dlt)
    import nt
    importlib.reload(nt)
    all_functions = inspect.getmembers(nt, inspect.isfunction)
    for key, value in all_functions:
        if str(inspect.signature(value)) == "(*args, **kwargs)":
            value()
    

    deco = dlt.DLTDecorator()
    del nt, dlt
    sys.path.remove(path)
    
    return deco

   
   

    