
from ast import List
from functools import wraps
from databricks.connect import DatabricksSession

spark = DatabricksSession.builder.getOrCreate()

tables = {}

def table(func):
    def function_wrapper( *args, **kwargs):
        previous = func.__globals__['dlt']
        previousSpark = None
        if 'spark' in func.__globals__:
            previousSpark = func.__globals__['spark']
        func.__globals__['dlt'] = DltRunner(func.__name__)
        func.__globals__['spark'] = SparkWrapper()
        result = func(*args, **kwargs)
        func.__globals__['dlt'] = previous
        func.__globals__['spark'] = previousSpark
        tables[func.__name__] = result
        return result
    return function_wrapper

class Reader:
        def table(self, path):
            return spark.read.table(path)
        
class SparkWrapper:
    read = Reader()
       
    
class DltRunner:
    def __init__(self, name: str) -> None:
        self.name = name

    def read(self, path):
        return tables[path]
        

