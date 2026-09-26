import pandas as pd


TRANSACTIONS = "data/processed/transactions_processed.csv"
FEATURES = "data/processed/account_features.csv"
OUTPUT = "data/processed/ml_dataset.csv"

CHUNK_SIZE = 100_000


def create_ml_dataset():

    features = pd.read_csv(FEATURES)

    laundering_accounts = set()

    # Read full transaction dataset in chunks
    for chunk in pd.read_csv(
        TRANSACTIONS,
        chunksize=CHUNK_SIZE
    ):

        laundering = chunk[chunk["Is Laundering"] == 1]

        laundering_accounts.update(laundering["Account"])
        laundering_accounts.update(laundering["Account.1"])

    # Create account-level label
    features["is_laundering_account"] = (
        features["Account"].isin(laundering_accounts).astype(int)
    )

    features.to_csv(OUTPUT, index=False)

    print("ML dataset created")
    print("Accounts:", len(features))

    print("\nLabel distribution:")
    print(features["is_laundering_account"].value_counts())


if __name__ == "__main__":
    create_ml_dataset()