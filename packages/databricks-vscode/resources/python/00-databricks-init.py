from databricks.sdk.runtime import dbutils
from databricks.connect import DatabricksSession
from pyspark.sql import SparkSession, functions as udf

# "display", "displayHTML", "dbutils", "table", "sql", "udf", "getArgument", "sc", "sqlContext", "spark"
spark: SparkSession = DatabricksSession.builder.getOrCreate()
sql = spark.sql
getArgument = dbutils.widgets.getArgument
