from databricks.sdk.runtime import dbutils
from databricks.connect import DatabricksSession
from pyspark.sql import SparkSession, functions as udf

# "displayHTML", "table", "sc", "sqlContext" are missing
spark: SparkSession = DatabricksSession.builder.getOrCreate()
sql = spark.sql
getArgument = dbutils.widgets.getArgument
