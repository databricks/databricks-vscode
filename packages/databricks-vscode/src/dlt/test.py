
from server import Dltutils

    
# Test get graph
path = "./notebook1.py"
print(Dltutils().get_graph(path))
print(Dltutils().get_graph("./notebookA.py"))
