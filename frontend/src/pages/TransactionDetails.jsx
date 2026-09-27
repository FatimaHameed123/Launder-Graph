import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTransaction, parseReasons } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function TransactionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reloadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransaction(id);
      setTransaction(data);
    } catch (err) {
      console.error('Error fetching transaction detail:', err);
      setError(`Unable to find transaction record #${id}. It may not exist in the database.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getTransaction(id);
        if (active) {
          setTransaction(data);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error('Error fetching transaction detail:', err);
          setError(`Unable to find transaction record #${id}. It may not exist in the database.`);
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <LoadingSpinner message={`Retrieving forensic trace for Transaction #${id}...`} />;
  }

  if (error || !transaction) {
    return (
      <ErrorState
        title="Transaction Trace Not Found"
        message={error || `Transaction #${id} could not be retrieved from the AML analytics store.`}
        onRetry={reloadData}
      />
    );
  }

  const reasonsList = parseReasons(transaction.reasons);
  const riskPercent = Math.min(100, Math.round((Number(transaction.risk_score) || 0) * 100));

  return (
    <div className="page-content pop-in">
      {/* Top Navigation & Breadcrumbs */}
      <div className="details-header-nav">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/transactions')}
        >
          ← Back to Transactions
        </button>

        <div className="details-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate(`/investigation?transactionId=${transaction.transaction_id}`)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Investigate Transaction
          </button>
        </div>
      </div>

      {/* Hero Summary Card */}
      <div className="transaction-hero-card glass-panel">
        <div className="hero-top-row">
          <div className="hero-identity">
            <span className="hero-sublabel">TRANSACTION IDENTIFIER</span>
            <h1 className="hero-id font-mono">#{transaction.transaction_id}</h1>
          </div>
          <div className="hero-badge-wrap">
            <RiskBadge level={transaction.risk_level} score={transaction.risk_score} />
          </div>
        </div>

        <div className="hero-grid">
          <div className="hero-stat-box">
            <span className="stat-label">Transfer Volume</span>
            <div className="stat-value text-emerald font-mono font-bold">
              ${Number(transaction.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="stat-caption">USD Equivalent</span>
          </div>

          <div className="hero-stat-box">
            <span className="stat-label">Execution Timestamp</span>
            <div className="stat-value font-mono">
              {transaction.timestamp ? transaction.timestamp.replace('T', ' ') : '—'}
            </div>
            <span className="stat-caption">Normalized UTC</span>
          </div>

          <div className="hero-stat-box">
            <span className="stat-label">Anomaly Risk Score</span>
            <div className="stat-value font-mono text-danger">
              {transaction.risk_score !== undefined ? `${transaction.risk_score} / 1.0` : '—'}
            </div>
            <div className="risk-score-bar-container">
              <div
                className="risk-score-bar-fill"
                style={{
                  width: `${riskPercent}%`,
                  backgroundColor: riskPercent > 70 ? '#f43f5e' : riskPercent > 40 ? '#fbbf24' : '#10b981',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Routing & Counterparty Flow */}
      <div className="flow-panel glass-panel mt-4">
        <h3 className="panel-title">Counterparty Route</h3>
        <p className="panel-subtitle">Audited flow of funds between originating and receiving bank entities</p>

        <div className="counterparty-flow-grid">
          {/* Origin Account */}
          <div className="account-card origin-card">
            <div className="account-tag origin-tag">ORIGIN / SENDER ACCOUNT</div>
            <div className="account-number font-mono">{transaction.from_account}</div>
            <div className="account-meta">
              <span>Status: <strong className="text-emerald">Monitored</strong></span>
              <span>Entity Type: <strong>Corporate ACH / Wire</strong></span>
            </div>
          </div>

          {/* Transfer Visual Connector */}
          <div className="flow-direction-indicator">
            <div className="flow-line" />
            <div className="flow-arrow-badge">
              <span className="flow-amount-pill">
                ${Number(transaction.amount || 0).toLocaleString()}
              </span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
            <div className="flow-line" />
          </div>

          {/* Destination Account */}
          <div className="account-card target-card">
            <div className="account-tag target-tag">DESTINATION / TARGET ACCOUNT</div>
            <div className="account-number font-mono">{transaction.to_account}</div>
            <div className="account-meta">
              <span>Status: <strong className="text-warning">High Activity</strong></span>
              <span>Entity Type: <strong>Beneficiary Node</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Flagged Reasons Section */}
      <div className="flagged-reasons-panel glass-panel mt-4">
        <div className="panel-header-with-badge">
          <div>
            <h3 className="panel-title text-danger">Why was this transaction flagged?</h3>
            <p className="panel-subtitle">
              Heuristic trigger rules and graph topology anomaly factors identified by LaunderGraph
            </p>
          </div>
          <span className="reasons-count-badge">
            {reasonsList.length} Trigger Rule{reasonsList.length === 1 ? '' : 's'}
          </span>
        </div>

        {reasonsList.length === 0 ? (
          <div className="reasons-empty">
            No specific trigger explanations recorded in telemetry for this entry.
          </div>
        ) : (
          <div className="reasons-cards-container">
            {reasonsList.map((reason, index) => (
              <div key={index} className="reason-rule-card">
                <div className="reason-rule-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="reason-rule-content">
                  <span className="reason-rule-number font-mono">RULE TRIGGER #{index + 1}</span>
                  <h4 className="reason-rule-text">{reason}</h4>
                  <p className="reason-rule-desc">
                    {reason.toLowerCase().includes('counterparties')
                      ? 'Network density analysis flagged an unnatural convergence of multi-origin inflows into this destination node.'
                      : reason.toLowerCase().includes('ach')
                      ? 'Automated Clearing House transaction parameters match high-velocity rapid dispersal patterns.'
                      : reason.toLowerCase().includes('amount') || reason.toLowerCase().includes('log')
                      ? 'Transaction amount deviates significantly from standard logarithmic baseline distributions.'
                      : 'Statistical deviation observed in graph topological neighborhood behavior.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Investigation Prompt */}
      <div className="investigation-cta-card glass-panel mt-4">
        <div className="cta-content">
          <h4>Escalate or Record Case Findings</h4>
          <p>
            Assign an AML compliance officer status, log suspicious activity report (SAR) notes, or archive this trace.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate(`/investigation?transactionId=${transaction.transaction_id}`)}
        >
          Launch Case File #{transaction.transaction_id} →
        </button>
      </div>
    </div>
  );
}
