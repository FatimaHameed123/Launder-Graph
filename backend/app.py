from fastapi import FastAPI, HTTPException
from pathlib import Path
import json

app = FastAPI(
    title="LaunderGraph API",
    description="Backend API for AML transaction risk analysis",
    version="1.0.0"
)

DATA_FILE = Path(__file__).resolve().parent / "data" / "flagged_transactions.json"

with open(DATA_FILE, "r", encoding="utf-8") as f:
    transactions = json.load(f)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/transactions")
def get_transactions():
    return {
        "count": len(transactions),
        "transactions": transactions
    }


@app.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: int):

    for transaction in transactions:
        if transaction["transaction_id"] == transaction_id:
            return transaction

    raise HTTPException(
        status_code=404,
        detail="Transaction not found"
    )


@app.get("/summary")
def get_summary():

    high_risk = sum(
        1 for t in transactions
        if t["risk_level"] == "HIGH"
    )

    medium_risk = sum(
        1 for t in transactions
        if t["risk_level"] == "MEDIUM"
    )

    return {
        "total_flagged": len(transactions),
        "high_risk": high_risk,
        "medium_risk": medium_risk
    }