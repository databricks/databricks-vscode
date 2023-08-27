
from server import Dltutils

    
# Test running all dependencies
path = "./notebook2.py"

utils = Dltutils()
print(utils.runUntil(path, "table2"))
print(utils.run(path, "table2"))
print(utils.runUntil(path, "table2"))
