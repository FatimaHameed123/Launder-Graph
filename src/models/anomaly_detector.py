import pandas as pd
from sklearn.ensemble import IsolationForest

INPUT_FILE = "data/processed/ml_dataset.csv"
OUTPUT_FILE = "data/processed/anomaly_results.csv"

FEATURE_COLUMNS = [
    "in_degree",
    "out_degree",
    "total_received",
    "total_sent",
    "total_transactions",
    "money_flow_ratio",
    "incoming_outgoing_ratio",
    "unique_receivers",
    "unique_senders",
    "unique_counterparties",
    "active_days",
    "transaction_frequency"
]


def train_anomaly_detector():

    df = pd.read_csv(INPUT_FILE)

    print("Dataset loaded")
    print("Accounts:", len(df))

    # Select behavioral features
    X = df[FEATURE_COLUMNS].fillna(0)

    print("Features used:", len(FEATURE_COLUMNS))

    # Isolation Forest
    model = IsolationForest(
        n_estimators=200,
        contamination=0.01,
        random_state=42,
        n_jobs=-1
    )

    print("\nTraining Isolation Forest...")

    model.fit(X)

    # Predictions
    df["anomaly_prediction"] = model.predict(X)

    # Higher score = more anomalous
    df["anomaly_score"] = -model.score_samples(X)

    # Save results
    df.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print("\n" + "=" * 50)
    print("ANOMALY DETECTION COMPLETED")
    print("=" * 50)

    print(
        f"Accounts analyzed: {len(df):,}"
    )

    print("\nAnomaly distribution:")
    print(
        df["anomaly_prediction"].value_counts()
    )

    print(
        f"\nResults saved to: {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    train_anomaly_detector()