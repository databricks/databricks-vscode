
from ast import List
from functools import wraps
import lsp_server.dlt_graph.dlt as dlt

@dlt.table
def table1():
    return spark.read.table("table").doStuff()
    


@dlt.table
def table2():
    return dlt.read("table1").doStuff()
    


def main():
    print("start")
    table2()
    table1()
    dlt.DLTDecorator().print()
    dlt.DLTDecorator().validate()


main()
