
from ast import List
from functools import wraps
import lsp_server.dlt_graph.dlt as dlt

@dlt.table
def table1():
    # some spark read
    pass


@dlt.table
def table2():
    dlt.read("table1")
    pass


def main():
    print("start")
    table2()
    table1()
    dlt.DLTDecorator().print()
    dlt.DLTDecorator().validate()


main()
