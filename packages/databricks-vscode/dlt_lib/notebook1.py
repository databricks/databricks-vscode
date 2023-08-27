
from ast import List
from functools import wraps
import dlt

@dlt.table
def table1():
    # some spark read
    pass


@dlt.table
def table2():
    dlt.read("table1")
    pass

