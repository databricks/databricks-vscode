from databricks.connect import DatabricksSession
from databricks.sdk import WorkspaceClient

spark = DatabricksSession.builder.getOrCreate()
dbutils = WorkspaceClient().dbutils
global _sqldf

from IPython.core.magic import Magics, magics_class, cell_magic

@magics_class
class DatabricksMagics(Magics):

    @cell_magic
    def sql(self, line, cell):
        global _sqldf
        _sqldf = spark.sql(cell)
        return _sqldf


def df_html(df):
    return df.limit(20).toPandas().to_html()

if __name__ == '__main__':
    from IPython import get_ipython
    from pyspark.sql.connect.dataframe import DataFrame
    
    get_ipython().register_magics(DatabricksMagics)


    html_formatter = get_ipython().display_formatter.formatters['text/html']
    html_formatter.for_type(DataFrame, df_html)
