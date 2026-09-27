import json
from datetime import datetime
from database import SessionLocal
from models import Transaction

def seed():
    db = SessionLocal()

    with open("data/flagged_transactions.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    count = 0
    for record in data:
        existing = db.query(Transaction).filter(
            Transaction.transaction_id == record["transaction_id"]
        ).first()
        if existing:
            continue  # skip if already seeded (safe to re-run)

        txn = Transaction(
            transaction_id=record["transaction_id"],
            from_account=record["from_account"],
            to_account=record["to_account"],
            amount=record["amount"],
            timestamp=datetime.fromisoformat(record["timestamp"]),
            risk_score=record["risk_score"],
            risk_level=record["risk_level"],
            reasons=json.dumps(record["reasons"]),
        )
        db.add(txn)
        count += 1

    db.commit()
    db.close()
    print(f"Seeded {count} new transactions.")

if __name__ == "__main__":
    seed()