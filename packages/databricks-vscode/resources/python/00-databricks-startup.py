import os
from pyspark.sql import SparkSession

def loadEnv():
    def findDatabricksDir(dirPath):
        if(dirPath == "/"):
            return None

        subdirs = os.listdir(dirPath)
        for dir in subdirs:
            if(dir == ".databricks"):
                return os.path.join(dirPath, ".databricks")

        return findDatabricksDir(os.path.dirname(dirPath))

    databricksDir = findDatabricksDir(os.path.abspath(os.curdir))

    if "databricks.env" in os.listdir(databricksDir):
        with open(os.path.join(databricksDir, "databricks.env"), "r") as fil:
            for line in fil.readlines():
                segs = line.split("=")
                os.environ[segs[0]] = '='.join(segs[1:])

loadEnv()
del loadEnv

spark = SparkSession.builder.getOrCreate()
from databricks.sdk.runtime import dbutils

from IPython.core.magic import (Magics, magics_class, line_magic, cell_magic)

@magics_class
class DatabricksMagics(Magics):

    @cell_magic
    def sql(self, line, cell):
        spark.sql(cell).show()


if __name__ == '__main__':
    from IPython import get_ipython
    get_ipython().register_magics(DatabricksMagics)
