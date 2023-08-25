
import networkx as nx
import matplotlib.pyplot as plt


def plot(dependencies):
    G = nx.DiGraph()
    pos = nx.spring_layout(G, seed=3113794652)  # positions for all nodes

   
    for key in dependencies:
        G.add_node(key)
        deps = dependencies[key]
        for dep in deps:
            G.add_node(dep)
            G.add_edge(dep, key)




    pos = nx.spring_layout(G)

    nx.draw(G, pos, with_labels=True, node_size=1500, node_color='yellow', font_size=8, font_weight='bold')

    plt.tight_layout()
    plt.savefig("Graph.png", format="PNG")
    plt.show()

