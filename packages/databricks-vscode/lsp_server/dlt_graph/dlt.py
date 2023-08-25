
from ast import List
from functools import wraps

def singleton(class_):
    instances = {}
    def getinstance(*args, **kwargs):
        if class_ not in instances:
            instances[class_] = class_(*args, **kwargs)
        return instances[class_]
    return getinstance

@singleton
class DLTDecorator:
    def __init__(self) -> None:
        self.dependencies = {}
        self.nodes = set()
        self.tables = set()
    
    def print(self):
        print('Registered Input Tables: {0}'.format(self.tables))
        print('Registered DLT tables: {0}'.format(self.nodes))
        print('Dependencies: {0}'.format(self.dependencies))
    
    def getDependencies(self):
        return self.dependencies
    
    def validate(self):
        for node in self.dependencies.keys():
            for dependency in self.dependencies[node]:
                if (not dependency in self.nodes) and (not dependency in self.tables) :
                    raise Exception("Unknown table {0}".format(dependency))
        #TODO check circular dependencies



def table(func):
    def function_wrapper( *args, **kwargs):
        dlt_decorator = DLTDecorator()
        dlt_decorator.nodes.add(func.__name__)
        previous = func.__globals__['dlt']
        previousSpark = None
        if 'spark' in func.__globals__:
            previousSpark = func.__globals__['spark']
        func.__globals__['dlt'] = CustomDlt(func.__name__, DLTDecorator())
        func.__globals__['spark'] = SparkWrapper(func.__name__, DLTDecorator())
        result = func(*args, **kwargs)
        func.__globals__['dlt'] = previous
        func.__globals__['spark'] = previousSpark
        return result
    return function_wrapper

    
class CustomDlt:
    def __init__(self, name: str, dlt_decorator: DLTDecorator) -> None:
        self.dlt_decorator = dlt_decorator
        self.name = name

    def read(self, path):
        if self.name == self.dlt_decorator.dependencies:
            self.dlt_decorator.dependencies[self.name].append(path)
        else:
            self.dlt_decorator.dependencies[self.name] = [path]
        return self
    
    def __getattr__(self,attr):
        try:
            return super(CustomDlt, self).__getattr__(attr)
        except AttributeError:
            return self.__get_global_handler(attr)

    def __get_global_handler(self, name):
        # Do anything that you need to do before simulating the method call
        handler = self.__global_handler
        return handler

    def __global_handler(self, *args, **kwargs):
        # Do something with these arguments
        return self

class Reader:

    def __init__(self, name: str, dlt_decorator: DLTDecorator) -> None:
        self.dlt_decorator = dlt_decorator
        self.name = name

    def table(self, path):
        self.dlt_decorator.tables.add(path)
        if self.name == self.dlt_decorator.dependencies:
            self.dlt_decorator.dependencies[self.name].append(path)
        else:
            self.dlt_decorator.dependencies[self.name] = [path]
        return self

    def __getattr__(self,attr):
        try:
            return super(Reader, self).__getattr__(attr)
        except AttributeError:
            return self.__get_global_handler(attr)

    def __get_global_handler(self, name):
        # Do anything that you need to do before simulating the method call
        handler = self.__global_handler
        return handler

    def __global_handler(self, *args, **kwargs):
        # Do something with these arguments
        return self
        
class SparkWrapper:
    read: Reader

    def __init__(self, name: str, dlt_decorator: DLTDecorator) -> None:
        self.dlt_decorator = dlt_decorator
        self.name = name
        self.read = Reader(name, dlt_decorator)
    
       