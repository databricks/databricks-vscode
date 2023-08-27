
from ast import List
from functools import wraps
import dlt

@dlt.table
def table1():
    df = spark.read.table("main.taxi_brick.taxi_trips")
    print(df)
    return df
    # some spark read
    


@dlt.table
def table2():
    df = dlt.read("table1").withColumnRenamed("trip_distance", "trip_distance_renamed")
    print(df)
    return df
    


def main():
    table1()
    table2()
   


main()

#from databricks.connect import DatabricksSession
#spark = DatabricksSession.builder.getOrCreate()

# dlt.read -> spark.read.table
