from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pathlib import Path
import json
# from fastapi import FastAPI, HTTPException
# from pathlib import Path
# import json

# app = FastAPI(
#     title="LaunderGraph API",
#     description="Backend API for AML transaction risk analysis",
#     version="1.0.0"
# )

# DATA_FILE = Path(__file__).resolve().parent / "data" / "flagged_transactions.json"

# with open(DATA_FILE, "r", encoding="utf-8") as f:
#     transactions = json.load(f)


# @app.get("/health")
# def health():
#     return {"status": "ok"}


# @app.get("/transactions")
# def get_transactions():
#     return {
#         "count": len(transactions),
#         "transactions": transactions
#     }


# @app.get("/transactions/{transaction_id}")
# def get_transaction(transaction_id: int):

#     for transaction in transactions:
#         if transaction["transaction_id"] == transaction_id:
#             return transaction

#     raise HTTPException(
#         status_code=404,
#         detail="Transaction not found"
#     )


# @app.get("/summary")
# def get_summary():

#     high_risk = sum(
#         1 for t in transactions
#         if t["risk_level"] == "HIGH"
#     )

#     medium_risk = sum(
#         1 for t in transactions
#         if t["risk_level"] == "MEDIUM"
#     )

#     return {
#         "total_flagged": len(transactions),
#         "high_risk": high_risk,
#         "medium_risk": medium_risk
#     }
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Transaction, Investigation
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(
    title="LaunderGraph API",
    description="Backend API for AML transaction risk analysis",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = Path(__file__).resolve().parent / "data" / "flagged_transactions.json"

with open(DATA_FILE, "r", encoding="utf-8") as f:
    transactions = json.load(f)
class InvestigationCreate(BaseModel):
    transaction_id: int
    status: str = "OPEN"
    notes: str | None = None

class InvestigationUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/transactions")
def get_transactions(db: Session = Depends(get_db)):
    transactions = db.query(Transaction).all()
    return {"count": len(transactions), "transactions": transactions}

@app.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn

@app.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    total = db.query(Transaction).count()
    high = db.query(Transaction).filter(Transaction.risk_level == "HIGH").count()
    medium = db.query(Transaction).filter(Transaction.risk_level == "MEDIUM").count()
    return {"total_flagged": total, "high_risk": high, "medium_risk": medium}

@app.get("/investigations")
def get_investigations(db: Session = Depends(get_db)):
    return db.query(Investigation).all()

@app.get("/investigations/{id}")
def get_investigation(id: int, db: Session = Depends(get_db)):
    inv = db.query(Investigation).filter(Investigation.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return inv

@app.post("/investigations")
def create_investigation(inv: InvestigationCreate, db: Session = Depends(get_db)):
    new_inv = Investigation(**inv.dict())
    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    return new_inv

@app.put("/investigations/{id}")
def update_investigation(id: int, inv: InvestigationUpdate, db: Session = Depends(get_db)):
    existing = db.query(Investigation).filter(Investigation.id == id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Investigation not found")
    if inv.status is not None:
        existing.status = inv.status
    if inv.notes is not None:
        existing.notes = inv.notes
    existing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(existing)
    return existing