
from ast import List
from functools import wraps
import dlt

@dlt.table
def table1():
    df = spark.read.table("main.taxi_brick.taxi_trips")
    return df
    # some spark read
    


@dlt.table
def table2():
    df = dlt.read("table1").withColumnRenamed("trip_distance", "trip_distance_renamed")
    return df
    