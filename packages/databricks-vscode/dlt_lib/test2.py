
from server import Dltutils

    
# Test run one function
path = "./notebook2.py"
utils = Dltutils()
print(utils.run(path, "table1"))
print(utils.run(path, "table2"))
