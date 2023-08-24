from pygls import uris, server, workspace
from lsprotocol import types
lsp = server.LanguageServer("databricks-vscode", "0.0.0")

class CustomDlt:
    def __init__(self, name, dlt_decorator) -> None:
        self.dlt_decorator = dlt_decorator
        self.name = name

    def read(self, path):
        self.dlt_decorator.dependencies[self.name].append(path)
        
class DLTDecorator:
    def __init__(self) -> None:
        self.dependencies = {}

    def table(self, f, *args, **kwargs):
        globals()['dlt'] = CustomDlt(f.__name__, self)
        return f(*args, **kwargs)

dlt = DLTDecorator()

@dlt.table
def test():
    df = dlt.read("test2")
    df = df.transform()



@dlt.table
def test2():
    return ""


# append this programatically
if __name__ == "__main__":
    spark.sql("select * from test")

# test2  test
