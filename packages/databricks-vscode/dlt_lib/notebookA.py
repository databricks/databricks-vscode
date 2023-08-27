
from ast import List
from functools import wraps
import dlt

@dlt.table
def tableA():
    # some spark read
    pass


@dlt.table
def table2():
    dlt.read("tableA")
    pass

