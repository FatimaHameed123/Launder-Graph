import pandas as pd

INPUT_FILE = "data/processed/transactions_processed.csv"
OUTPUT_FILE = "data/processed/account_features.csv"

CHUNK_SIZE = 100_000


def create_account_features():

    account_stats = {}

    for chunk in pd.read_csv(
        INPUT_FILE,
        chunksize=CHUNK_SIZE,
        parse_dates=["Timestamp"]
    ):

        # =====================================================
        # 1. OUTGOING TRANSACTIONS
        # =====================================================

        outgoing = chunk.groupby("Account").agg(
            out_degree=("Account.1", "count"),
            total_sent=("Amount Paid", "sum")
        )

        # =====================================================
        # 2. INCOMING TRANSACTIONS
        # =====================================================

        incoming = chunk.groupby("Account.1").agg(
            in_degree=("Account", "count"),
            total_received=("Amount Received", "sum")
        )

        # =====================================================
        # 3. STORE OUTGOING FEATURES
        # =====================================================

        for account, row in outgoing.iterrows():

            if account not in account_stats:
                account_stats[account] = {
                    "in_degree": 0,
                    "out_degree": 0,
                    "total_received": 0.0,
                    "total_sent": 0.0,
                    "unique_receivers": set(),
                    "unique_senders": set(),
                    "active_days": set()
                }

            account_stats[account]["out_degree"] += int(
                row["out_degree"]
            )

            account_stats[account]["total_sent"] += float(
                row["total_sent"]
            )

        # =====================================================
        # 4. STORE INCOMING FEATURES
        # =====================================================

        for account, row in incoming.iterrows():

            if account not in account_stats:
                account_stats[account] = {
                    "in_degree": 0,
                    "out_degree": 0,
                    "total_received": 0.0,
                    "total_sent": 0.0,
                    "unique_receivers": set(),
                    "unique_senders": set(),
                    "active_days": set()
                }

            account_stats[account]["in_degree"] += int(
                row["in_degree"]
            )

            account_stats[account]["total_received"] += float(
                row["total_received"]
            )

        # =====================================================
        # 5. UNIQUE COUNTERPARTIES + ACTIVE DAYS
        # =====================================================

        for sender, receiver, timestamp in zip(
            chunk["Account"],
            chunk["Account.1"],
            chunk["Timestamp"]
        ):

            date = timestamp.date()

            # Sender information
            account_stats[sender]["unique_receivers"].add(
                receiver
            )

            account_stats[sender]["active_days"].add(
                date
            )

            # Receiver information
            account_stats[receiver]["unique_senders"].add(
                sender
            )

            account_stats[receiver]["active_days"].add(
                date
            )

        print(
            f"Processed chunk: {len(chunk):,} transactions"
        )

    # =========================================================
    # 6. CREATE FINAL FEATURE TABLE
    # =========================================================

    records = []

    for account, stats in account_stats.items():

        in_degree = stats["in_degree"]
        out_degree = stats["out_degree"]

        total_received = stats["total_received"]
        total_sent = stats["total_sent"]

        # Total number of transactions
        total_transactions = (
            in_degree + out_degree
        )

        # Money flow ratio
        money_flow_ratio = (
            total_received /
            (total_sent + 1)
        )

        # Incoming vs outgoing activity
        incoming_outgoing_ratio = (
            in_degree /
            (out_degree + 1)
        )

        # Unique counterparties
        unique_receivers = len(
            stats["unique_receivers"]
        )

        unique_senders = len(
            stats["unique_senders"]
        )

        unique_counterparties = (
            unique_receivers +
            unique_senders
        )

        # Number of days account was active
        active_days = len(
            stats["active_days"]
        )

        # Transactions per active day
        transaction_frequency = (
            total_transactions /
            (active_days + 1)
        )

        records.append({

            "Account": account,

            "in_degree": in_degree,

            "out_degree": out_degree,

            "total_received": total_received,

            "total_sent": total_sent,

            "total_transactions": total_transactions,

            "money_flow_ratio": money_flow_ratio,

            "incoming_outgoing_ratio":
                incoming_outgoing_ratio,

            "unique_receivers":
                unique_receivers,

            "unique_senders":
                unique_senders,

            "unique_counterparties":
                unique_counterparties,

            "active_days":
                active_days,

            "transaction_frequency":
                transaction_frequency
        })

    # =========================================================
    # 7. DATAFRAME
    # =========================================================

    features = pd.DataFrame(records)

    # Replace infinite values
    features = features.replace(
        [float("inf"), float("-inf")],
        0
    )

    # Replace missing values
    features = features.fillna(0)

    # =========================================================
    # 8. SAVE
    # =========================================================

    features.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print("\n" + "=" * 50)
    print("ACCOUNT FEATURE ENGINEERING COMPLETED")
    print("=" * 50)

    print(
        f"Accounts processed: {len(features):,}"
    )

    print(
        f"Features created: {len(features.columns)}"
    )

    print(
        f"Saved to: {OUTPUT_FILE}"
    )

    print("\nFeature columns:")

    for column in features.columns:
        print(f"- {column}")


if __name__ == "__main__":
    create_account_features()