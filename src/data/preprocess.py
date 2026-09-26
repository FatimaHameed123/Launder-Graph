import pandas as pd
import os


INPUT_FILE = "data/raw/HI-Small_Trans.csv"
OUTPUT_FILE = "data/processed/transactions_processed.csv"

CHUNK_SIZE = 100_000


def process_transactions():

    first_chunk = True
    total_rows = 0

    for chunk in pd.read_csv(INPUT_FILE, chunksize=CHUNK_SIZE):

        # Convert timestamp
        chunk["Timestamp"] = pd.to_datetime(chunk["Timestamp"])

        # Convert amounts
        chunk["Amount Received"] = pd.to_numeric(
            chunk["Amount Received"], errors="coerce"
        )

        chunk["Amount Paid"] = pd.to_numeric(
            chunk["Amount Paid"], errors="coerce"
        )

        # Remove rows missing essential information
        required_columns = [
            "Timestamp",
            "Account",
            "Account.1",
            "Amount Received",
            "Amount Paid",
            "Is Laundering"
        ]

        chunk = chunk.dropna(subset=required_columns)

        # Time features
        chunk["Hour"] = chunk["Timestamp"].dt.hour
        chunk["Day"] = chunk["Timestamp"].dt.day
        chunk["Month"] = chunk["Timestamp"].dt.month

        # Save chunk
        chunk.to_csv(
            OUTPUT_FILE,
            mode="w" if first_chunk else "a",
            header=first_chunk,
            index=False
        )

        first_chunk = False
        total_rows += len(chunk)

        print(f"Processed: {total_rows:,} rows")


if __name__ == "__main__":
    process_transactions()