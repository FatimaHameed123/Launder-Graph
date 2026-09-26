import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

INPUT_FILE = "data/processed/anomaly_results.csv"

def evaluate_model():
    df = pd.read_csv(INPUT_FILE)

    # Convert Isolation Forest prediction:
    # -1 = anomaly → 1
    #  1 = normal  → 0
    df["predicted_laundering"] = (
        df["anomaly_prediction"] == -1
    ).astype(int)

    y_true = df["is_laundering_account"]
    y_pred = df["predicted_laundering"]

    print("Classification Report:\n")
    print(classification_report(
        y_true,
        y_pred,
        target_names=["Not Laundering Label", "Laundering Label"],
        zero_division=0
    ))

    print("\nConfusion Matrix:\n")
    print(confusion_matrix(y_true, y_pred))

if __name__ == "__main__":
    evaluate_model()