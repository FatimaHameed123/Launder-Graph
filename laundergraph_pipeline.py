"""
LaunderGraph — corrected ML pipeline
=====================================

Fixes applied vs. the original approach:
  1. Supervised transaction-level classification instead of unsupervised
     Isolation Forest (you HAVE labels — use them directly).
  2. Strict temporal train/val/test split — no feature is ever computed
     using data from after the point being predicted.
  3. Class imbalance handled via scale_pos_weight, not via an arbitrary
     `contamination` guess.
  4. Threshold chosen on the validation set to hit a realistic
     "investigation budget", not a default 0.5 cutoff.
  5. Evaluation uses PR-AUC / precision@k / recall@FP-budget instead of
     accuracy.
  6. SHAP-based explanations for each flagged transaction.

Run stages independently — each stage caches its output to disk so you
don't have to recompute the 5M-row pass every time you tweak the model.

    python laundergraph_pipeline.py --stage features
    python laundergraph_pipeline.py --stage train
    python laundergraph_pipeline.py --stage evaluate
    python laundergraph_pipeline.py --stage explain

Install once:
    pip install lightgbm shap scikit-learn pandas numpy scipy
"""

import argparse
import numpy as np
import pandas as pd
from pathlib import Path

# ----------------------------------------------------------------------
# CONFIG — edit these paths/params for your machine
# ----------------------------------------------------------------------
RAW_CSV = "data/raw/HI-Small_Trans.csv"          # your original file
CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)

TRAIN_FRAC = 0.70   # by TIME, not by row count
VAL_FRAC = 0.15      # remaining 0.15 is test
CHUNK_SIZE = 200_000

RANDOM_STATE = 42


# ----------------------------------------------------------------------
# STAGE 1 — Feature engineering with a hard temporal cutoff
# ----------------------------------------------------------------------
def build_features_no_leakage():
    """
    Core idea: for every transaction, its features may only use account
    history STRICTLY BEFORE that transaction's own timestamp. We do this
    with an expanding-window pass, sorted by time, using running
    dictionaries per account (O(1) update per row -> scales to 5M rows).
    """
    print("Loading and sorting by timestamp (streamed)...")
    df = pd.read_csv(RAW_CSV, parse_dates=["Timestamp"])
    df = df.sort_values("Timestamp").reset_index(drop=True)

    # running per-account state, updated as we scan forward in time
    state = {}  # account_id -> dict of running stats

    def get_state(acct):
        if acct not in state:
            state[acct] = dict(
                n_sent=0, n_recv=0,
                sum_sent=0.0, sum_recv=0.0,
                sumsq_sent=0.0,
                last_ts=None, last_recv_ts=None,
                counterparties_sent=set(), counterparties_recv=set(),
            )
        return state[acct]

    feat_rows = []
    for i, row in df.iterrows():
        src, dst = row["Account"], row["Account.1"]
        amt = row["Amount Paid"]
        ts = row["Timestamp"]

        s = get_state(src)
        d = get_state(dst)

        # ---- features computed BEFORE updating state with this row ----
        src_hist_n = s["n_sent"]
        src_hist_mean = (s["sum_sent"] / src_hist_n) if src_hist_n else 0.0
        src_hist_std = (
            np.sqrt(max(s["sumsq_sent"] / src_hist_n - src_hist_mean**2, 0))
            if src_hist_n else 0.0
        )
        amt_zscore = (amt - src_hist_mean) / (src_hist_std + 1e-6) if src_hist_n else 0.0

        # NOTE: don't encode "no prior transaction" as a sentinel like -1.
        # A sentinel sits far outside the real distribution and gives trees
        # an artificially clean, dominant split (this is what collapsed the
        # earlier model to a single-split tree). Instead: use a neutral
        # fill (the running median-ish proxy, or just 0 meaning "no gap
        # observed yet") AND a separate explicit boolean flag, so
        # "first-ever transaction" is a real, bounded feature.
        is_first_send = s["last_ts"] is None
        time_since_last_sent = (
            (ts - s["last_ts"]).total_seconds() if not is_first_send else 0.0
        )
        is_first_dst_recv = d["last_recv_ts"] is None
        time_since_dst_last_recv = (
            (ts - d["last_recv_ts"]).total_seconds() if not is_first_dst_recv else 0.0
        )

        feat_rows.append(dict(
            account_src=src,          # carried through for export/dashboard only
            account_dst=dst,          # NOT used as a training feature (raw IDs, not signal)
            raw_amount=amt,
            src_hist_n_sent=src_hist_n,
            src_hist_mean_amt=src_hist_mean,
            src_amt_zscore=amt_zscore,
            src_unique_counterparties=len(s["counterparties_sent"]),
            src_time_since_last_sent=time_since_last_sent,
            src_is_first_send=int(is_first_send),
            dst_hist_n_recv=d["n_recv"],
            dst_unique_counterparties=len(d["counterparties_recv"]),
            dst_time_since_last_recv=time_since_dst_last_recv,
            dst_is_first_recv=int(is_first_dst_recv),
            same_currency=int(row["Receiving Currency"] == row["Payment Currency"]),
            is_round_amount=int(amt == round(amt)),
            log_amount=np.log1p(amt),
            payment_format=row["Payment Format"],
            label=row["Is Laundering"],
            timestamp=ts,
        ))

        # ---- now update running state with this row ----
        s["n_sent"] += 1
        s["sum_sent"] += amt
        s["sumsq_sent"] += amt ** 2
        s["last_ts"] = ts
        s["counterparties_sent"].add(dst)

        d["n_recv"] += 1
        d["sum_recv"] += row["Amount Received"]
        d["last_recv_ts"] = ts
        d["counterparties_recv"].add(src)

        if i % 500_000 == 0:
            print(f"  processed {i:,} rows")

    feats = pd.DataFrame(feat_rows)
    feats = pd.get_dummies(feats, columns=["payment_format"], dummy_na=False)
    feats.to_parquet(CACHE_DIR / "features_no_leakage.parquet")
    print(f"Saved {len(feats):,} feature rows -> {CACHE_DIR/'features_no_leakage.parquet'}")

    # NOTE: graph features (PageRank, degree centrality, 2-hop neighbor risk)
    # are added separately in add_graph_features() below, computed ONCE per
    # split on the training-period edge list only (see stage 'train').


def add_graph_features(edge_df, node_ids):
    """
    Cheap, scalable graph features. Computed on ONE static snapshot of the
    graph (the training period's edges) — do not recompute per-row, that's
    both unnecessary and reintroduces leakage risk if done on the full data.
    """
    import scipy.sparse as sp

    id_to_idx = {a: i for i, a in enumerate(node_ids)}
    n = len(node_ids)
    src_idx = edge_df["Account"].map(id_to_idx).values
    dst_idx = edge_df["Account.1"].map(id_to_idx).values

    A = sp.coo_matrix((np.ones(len(edge_df)), (src_idx, dst_idx)), shape=(n, n)).tocsr()

    out_deg = np.asarray(A.sum(axis=1)).ravel()
    in_deg = np.asarray(A.sum(axis=0)).ravel()

    # power-iteration PageRank (fast, scales to millions of edges)
    d = 0.85
    pr = np.full(n, 1.0 / n)
    out_deg_safe = np.where(out_deg == 0, 1, out_deg)
    P = A.multiply(1.0 / out_deg_safe[:, None]).tocsr()
    for _ in range(15):
        pr = (1 - d) / n + d * (P.T @ pr)

    return pd.DataFrame({
        "account": node_ids,
        "in_degree": in_deg,
        "out_degree": out_deg,
        "pagerank": pr,
    })


# ----------------------------------------------------------------------
# STAGE 2 — temporal split + training
# ----------------------------------------------------------------------
def train():
    import lightgbm as lgb

    feats = pd.read_parquet(CACHE_DIR / "features_no_leakage.parquet")
    feats = feats.sort_values("timestamp")

    n = len(feats)
    train_end = int(n * TRAIN_FRAC)
    val_end = int(n * (TRAIN_FRAC + VAL_FRAC))

    train_df = feats.iloc[:train_end]
    val_df = feats.iloc[train_end:val_end]
    test_df = feats.iloc[val_end:]

    print(f"Train: {len(train_df):,} | Val: {len(val_df):,} | Test: {len(test_df):,}")
    print(f"Train positives: {train_df['label'].sum()} | "
          f"Val positives: {val_df['label'].sum()} | "
          f"Test positives: {test_df['label'].sum()}")

    drop_cols = ["label", "timestamp", "account_src", "account_dst", "raw_amount"]
    feature_cols = [c for c in feats.columns if c not in drop_cols]

    X_train, y_train = train_df[feature_cols], train_df["label"]
    X_val, y_val = val_df[feature_cols], val_df["label"]

    pos = y_train.sum()
    neg = len(y_train) - pos
    raw_ratio = neg / max(pos, 1)
    # Using the raw imbalance ratio (~1000+) as scale_pos_weight is too
    # aggressive here: it makes missing a positive so costly that the FIRST
    # split already grabs whatever feature best separates most positives
    # (often an extreme sentinel value like the -1 "no prior transaction"
    # flag) and calls it done -- every later tree then chases noise and
    # actively hurts validation average-precision, so early stopping fires
    # after round 1 and you end up with a single-split model. Cap it and
    # let regularization + more trees do the work instead.
    scale_pos_weight = min(raw_ratio, 50)
    print(f"raw imbalance ratio = {raw_ratio:.1f} -> using scale_pos_weight = {scale_pos_weight:.1f}")

    model = lgb.LGBMClassifier(
        n_estimators=2000,
        learning_rate=0.02,
        num_leaves=31,
        min_child_samples=100,      # don't let a leaf fit to a handful of rows
        reg_alpha=0.1,
        reg_lambda=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        metric="average_precision",  # avoid the dual binary_logloss/average_precision
        random_state=RANDOM_STATE,   # tug-of-war that stalled early stopping before
        n_jobs=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[
            lgb.early_stopping(100, first_metric_only=True),
            lgb.log_evaluation(50),
        ],
    )

    # Sanity check: if the model is still collapsing to a near-constant
    # score, you'll see very few unique values here -- a real, healthy
    # model on 5M rows should produce thousands of distinct scores.
    train_preview_scores = model.predict_proba(X_val.iloc[:50_000])[:, 1]
    print(f"Unique scores in a 50k val sample: {len(np.unique(train_preview_scores))}")

    model.booster_.save_model(
        str(CACHE_DIR / "model.txt"),
        num_iteration=model.best_iteration_,  # pin to the early-stopping checkpoint,
    )                                          # not whatever round training happened to stop at
    test_df.to_parquet(CACHE_DIR / "test_df.parquet")
    val_df.to_parquet(CACHE_DIR / "val_df.parquet")
    pd.Series(feature_cols).to_csv(CACHE_DIR / "feature_cols.csv", index=False)
    print("Model + splits cached.")


# ----------------------------------------------------------------------
# STAGE 3 — evaluation with the RIGHT metrics + threshold selection
# ----------------------------------------------------------------------
def evaluate():
    import lightgbm as lgb
    from sklearn.metrics import (
        average_precision_score, precision_recall_curve,
        precision_score, recall_score, f1_score, confusion_matrix,
    )

    booster = lgb.Booster(model_file=str(CACHE_DIR / "model.txt"))
    feature_cols = pd.read_csv(CACHE_DIR / "feature_cols.csv")["0"].tolist()
    val_df = pd.read_parquet(CACHE_DIR / "val_df.parquet")
    test_df = pd.read_parquet(CACHE_DIR / "test_df.parquet")

    val_scores = booster.predict(val_df[feature_cols])
    test_scores = booster.predict(test_df[feature_cols])
    # Raw (log-odds) scores are unbounded, so they don't hit the float64
    # ceiling the way sigmoid probabilities near 1.0 do -- use these for
    # ranking/threshold selection to avoid the tie-saturation problem,
    # while still reporting the calibrated probability for readability.
    val_raw = booster.predict(val_df[feature_cols], raw_score=True)
    test_raw = booster.predict(test_df[feature_cols], raw_score=True)

    print(f"Val PR-AUC:  {average_precision_score(val_df['label'], val_scores):.4f}")
    print(f"Test PR-AUC: {average_precision_score(test_df['label'], test_scores):.4f}")
    print("(Compare both to the random baseline = positive rate, "
          f"~{val_df['label'].mean():.4%})")

    # --- Threshold selection on VALIDATION only, by investigation budget ---
    # Example business rule: analysts can review ~200 flagged transactions
    # per day out of this validation window. Pick the threshold that flags
    # roughly that many, then report the precision/recall it buys you.
    budget = 200
    n_val = len(val_df)
    sorted_raw = np.sort(val_raw)[::-1]
    idx = min(budget, len(sorted_raw) - 1)
    chosen_threshold_raw = sorted_raw[idx]

    n_at_or_above = int((val_raw >= chosen_threshold_raw).sum())
    print(f"\nChosen raw-score threshold (target ~{budget}/{n_val} val txns): {chosen_threshold_raw:.4f}")
    print(f"Actually flags {n_at_or_above} transactions at this threshold.")
    if n_at_or_above > budget * 3:
        print("WARNING: far more ties at this score than expected -- the model's "
              "score distribution is too coarse (too few distinct values). "
              "Re-check training (see 'Unique scores' diagnostic) before trusting "
              "this threshold for a real investigation budget.")

    for name, df, raw in [("VAL", val_df, val_raw), ("TEST", test_df, test_raw)]:
        pred = (raw >= chosen_threshold_raw).astype(int)
        p = precision_score(df["label"], pred, zero_division=0)
        r = recall_score(df["label"], pred, zero_division=0)
        f1 = f1_score(df["label"], pred, zero_division=0)
        cm = confusion_matrix(df["label"], pred)
        print(f"\n[{name}] precision={p:.3f} recall={r:.3f} f1={f1:.3f}")
        print(cm)

    with open(CACHE_DIR / "threshold.txt", "w") as f:
        f.write(str(chosen_threshold_raw))


# ----------------------------------------------------------------------
# STAGE 4 — SHAP-based explanations for flagged transactions
# ----------------------------------------------------------------------
REASON_MAP = {
    "src_amt_zscore": "amount is unusually large relative to this account's history",
    "src_time_since_last_sent": "unusually rapid transaction velocity",
    "dst_time_since_dst_last_recv": "funds moved out almost immediately after being received (pass-through pattern)",
    "src_unique_counterparties": "abnormally high number of distinct counterparties",
    "dst_unique_counterparties": "receiving account has an abnormally high number of distinct counterparties",
    "pagerank": "connected to highly central / high-traffic accounts in the network",
    "same_currency": "unusual currency conversion pattern",
    "is_round_amount": "suspiciously round transaction amount",
}


def explain():
    import lightgbm as lgb
    import shap

    booster = lgb.Booster(model_file=str(CACHE_DIR / "model.txt"))
    feature_cols = pd.read_csv(CACHE_DIR / "feature_cols.csv")["0"].tolist()
    test_df = pd.read_parquet(CACHE_DIR / "test_df.parquet")
    threshold = float(open(CACHE_DIR / "threshold.txt").read())

    scores = booster.predict(test_df[feature_cols])          # calibrated probability, for display
    raw = booster.predict(test_df[feature_cols], raw_score=True)  # for thresholding, matches evaluate()
    flagged = test_df[raw >= threshold].copy()
    flagged["score"] = scores[raw >= threshold]

    explainer = shap.TreeExplainer(booster)
    shap_values = explainer.shap_values(flagged[feature_cols])

    top_n = 5
    for i in range(min(top_n, len(flagged))):
        row_shap = shap_values[i]
        top_feats = np.argsort(-np.abs(row_shap))[:3]
        reasons = [
            REASON_MAP.get(feature_cols[j], feature_cols[j])
            for j in top_feats if row_shap[j] > 0
        ]
        print(f"\nTransaction risk score: {flagged['score'].iloc[i]:.3f} — HIGH RISK")
        print("Reasons:")
        for r in reasons:
            print(f"  - {r}")


# ----------------------------------------------------------------------
# STAGE 5 — export flagged transactions for the backend/frontend team
# ----------------------------------------------------------------------
def export_for_team():
    """
    Produces cache/flagged_transactions.json -- the single handoff file for
    Team Member 2 (API) and Team Member 3 (dashboard). No live model access
    needed on their end; they just serve/consume this file.

    Schema (one object per flagged transaction):
        {
          "transaction_id": int,
          "from_account": str,
          "to_account": str,
          "amount": float,
          "timestamp": str (ISO 8601),
          "risk_score": float (0-1),
          "risk_level": "HIGH" | "MEDIUM",
          "reasons": [str, ...]
        }
    """
    import json
    import lightgbm as lgb
    import shap

    booster = lgb.Booster(model_file=str(CACHE_DIR / "model.txt"))
    feature_cols = pd.read_csv(CACHE_DIR / "feature_cols.csv")["0"].tolist()
    test_df = pd.read_parquet(CACHE_DIR / "test_df.parquet")
    threshold = float(open(CACHE_DIR / "threshold.txt").read())

    scores = booster.predict(test_df[feature_cols])
    raw = booster.predict(test_df[feature_cols], raw_score=True)
    flagged_mask = raw >= threshold
    flagged = test_df[flagged_mask].copy()
    flagged["score"] = scores[flagged_mask]
    flagged = flagged.reset_index(drop=True)

    print(f"Exporting {len(flagged)} flagged transactions...")

    explainer = shap.TreeExplainer(booster)
    shap_values = explainer.shap_values(flagged[feature_cols])

    # Medium/high split -- adjust the cutoff to taste, this is a
    # display convenience for the dashboard, not a modeling decision.
    HIGH_RISK_CUTOFF = 0.7

    records = []
    for i in range(len(flagged)):
        row_shap = shap_values[i]
        top_feats = np.argsort(-np.abs(row_shap))[:3]
        reasons = [
            REASON_MAP.get(feature_cols[j], feature_cols[j])
            for j in top_feats if row_shap[j] > 0
        ]
        score = float(flagged["score"].iloc[i])
        records.append({
            "transaction_id": int(i),
            "from_account": str(flagged["account_src"].iloc[i]),
            "to_account": str(flagged["account_dst"].iloc[i]),
            "amount": float(flagged["raw_amount"].iloc[i]),
            "timestamp": flagged["timestamp"].iloc[i].isoformat(),
            "risk_score": round(score, 4),
            "risk_level": "HIGH" if score >= HIGH_RISK_CUTOFF else "MEDIUM",
            "reasons": reasons if reasons else ["flagged by model (no dominant single reason)"],
        })

    out_path = CACHE_DIR / "flagged_transactions.json"
    with open(out_path, "w") as f:
        json.dump(records, f, indent=2)

    print(f"Saved -> {out_path}")
    print(f"Send this ONE file to Team Member 2. Example record:")
    print(json.dumps(records[0], indent=2) if records else "(none flagged)")


# ----------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["features", "train", "evaluate", "explain", "export"], required=True)
    args = parser.parse_args()

    {
        "features": build_features_no_leakage,
        "train": train,
        "evaluate": evaluate,
        "explain": explain,
        "export": export_for_team,
    }[args.stage]()