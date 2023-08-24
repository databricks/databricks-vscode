
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
        self.dependencies_set = set()
        self.dependencies = {}
        self.nodes = set()
        print("starting")
    
    def print(self):
        print('Registered Tables: {0}'.format(self.nodes))
        print('Dependencies: {0}'.format(self.dependencies))
    
    def getDependencies(self):
        return self.dependencies
    
    def validate(self):
        for node in self.dependencies.keys():
            for dependency in self.dependencies[node]:
                if not dependency in self.nodes:
                    raise Exception("Unknown table {0}".format(dependency))
        #TODO check circular dependencies



def table(func):
    def function_wrapper( *args, **kwargs):
        dlt_decorator = DLTDecorator()
        dlt_decorator.nodes.add(func.__name__)
        previous = func.__globals__['dlt']
        func.__globals__['dlt'] = CustomDlt(func.__name__, DLTDecorator())
        result = func(*args, **kwargs)
        func.__globals__['dlt'] = previous
        return result
    return function_wrapper

    
class CustomDlt:
    def __init__(self, name: str, dlt_decorator: DLTDecorator) -> None:
        self.dlt_decorator = dlt_decorator
        self.name = name

    def read(self, path):
        self.dlt_decorator.dependencies_set.add(path)
        if self.name == self.dlt_decorator.dependencies:
            self.dlt_decorator.dependencies[self.name].append(path)
        else:
            self.dlt_decorator.dependencies[self.name] = [path]

