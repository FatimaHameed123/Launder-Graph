import pandas as pd
import networkx as nx


INPUT_FILE = "data/processed/transactions_sample.csv"


def build_transaction_graph():
    df = pd.read_csv(INPUT_FILE)

    G = nx.DiGraph()

    for _, row in df.iterrows():
        sender = row["Account"]
        receiver = row["Account.1"]
        amount = row["Amount Paid"]

        G.add_edge(
            sender,
            receiver,
            amount=amount,
            timestamp=row["Timestamp"],
            laundering=row["Is Laundering"]
        )

    return G


if __name__ == "__main__":
    graph = build_transaction_graph()

    print("Nodes:", graph.number_of_nodes())
    print("Edges:", graph.number_of_edges())