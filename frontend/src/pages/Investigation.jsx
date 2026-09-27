import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getTransaction,
  getInvestigations,
  createInvestigation,
  updateInvestigation,
  parseReasons,
} from '../services/api';
import RiskBadge from '../components/RiskBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Investigation() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Search input state
  const initialQueryId = searchParams.get('transactionId') || '';
  const [transactionIdInput, setTransactionIdInput] = useState(initialQueryId);
  const [currentTransaction, setCurrentTransaction] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  // Existing investigations list
  const [investigations, setInvestigations] = useState([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState(null);

  // Form state
  const [status, setStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');
  const [existingInvestigationId, setExistingInvestigationId] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  // Refs for tracking timers and request sequence
  const debounceTimerRef = useRef(null);
  const activeRequestIdRef = useRef(0);
  const investigationsRef = useRef([]);
  const initialTxIdRef = useRef(initialQueryId);

  // Keep investigationsRef synchronized with state
  useEffect(() => {
    investigationsRef.current = investigations;
  }, [investigations]);

  // Fetch all existing investigations
  const loadInvestigations = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      const data = await getInvestigations();
      const list = Array.isArray(data) ? data : data.investigations || [];
      setInvestigations(list);
      investigationsRef.current = list;
    } catch (err) {
      console.error('Failed to load investigations:', err);
      setInvError('Unable to load investigation records from backend.');
    } finally {
      setInvLoading(false);
    }
  }, []);

  // Core lookup logic with strict request ID matching and finally block
  const performLookup = useCallback(
    async (idToSearch, currentInvList = investigationsRef.current) => {
      const trimmedId = idToSearch !== null && idToSearch !== undefined ? String(idToSearch).trim() : '';

      if (!trimmedId) {
        setLookupLoading(false);
        setLookupError(null);
        setCurrentTransaction(null);
        setExistingInvestigationId(null);
        return;
      }

      // Increment request ID to invalidate any previous in-flight requests
      const thisRequestId = ++activeRequestIdRef.current;
      setLookupLoading(true);
      setLookupError(null);
      setSaveSuccessMsg(null);

      try {
        const tx = await getTransaction(trimmedId);

        // Only commit if this response corresponds to the latest requested ID
        if (thisRequestId === activeRequestIdRef.current) {
          setCurrentTransaction(tx);
          setLookupError(null);

          // Check if an investigation already exists for this transaction
          const found = currentInvList.find(
            (inv) => String(inv.transaction_id) === String(tx.transaction_id)
          );

          if (found) {
            setExistingInvestigationId(found.id);
            setStatus(found.status || 'OPEN');
            setNotes(found.notes || '');
          } else {
            setExistingInvestigationId(null);
            setStatus('OPEN');
            setNotes('');
          }

          // Smoothly update URL search param without pushing to history or scrolling
          setSearchParams({ transactionId: String(tx.transaction_id) }, { replace: true });
        }
      } catch (err) {
        if (thisRequestId === activeRequestIdRef.current) {
          console.error('Lookup error for transaction ID:', trimmedId, err);
          setCurrentTransaction(null);
          setExistingInvestigationId(null);
          setLookupError(`Transaction #${trimmedId} was not found in the transaction registry.`);
        }
      } finally {
        // Guarantee loading state always resets
        if (thisRequestId === activeRequestIdRef.current) {
          setLookupLoading(false);
        }
      }
    },
    [setSearchParams]
  );

  // Debounced input change handler (450ms delay)
  const handleInputChange = (e) => {
    const val = e.target.value;
    setTransactionIdInput(val);

    // Cancel existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (!trimmed) {
      // Immediate reset when input is cleared
      activeRequestIdRef.current++;
      setLookupLoading(false);
      setLookupError(null);
      setCurrentTransaction(null);
      setExistingInvestigationId(null);
      setStatus('OPEN');
      setNotes('');
      setSearchParams({}, { replace: true });
      return;
    }

    // Set 450ms debounce before executing lookup
    debounceTimerRef.current = setTimeout(() => {
      performLookup(trimmed);
    }, 450);
  };

  // Form submit or "Analyze Trace" button click (immediate execution)
  const handleManualSearch = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const trimmed = transactionIdInput.trim();
    if (trimmed) {
      performLookup(trimmed);
    }
  };

  // Initial load: fetch investigations list and lookup initial query param once
  useEffect(() => {
    let active = true;
    (async () => {
      let invList = [];
      try {
        const data = await getInvestigations();
        invList = Array.isArray(data) ? data : data.investigations || [];
        if (active) {
          setInvestigations(invList);
          investigationsRef.current = invList;
          setInvLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error('Failed to load investigations:', err);
          setInvError('Unable to load investigation records from backend.');
          setInvLoading(false);
        }
      }

      if (initialTxIdRef.current && active) {
        performLookup(initialTxIdRef.current, invList);
      }
    })();

    return () => {
      active = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [performLookup]);

  // Handle Save / Update investigation
  const handleSaveInvestigation = async (e) => {
    e.preventDefault();
    if (!currentTransaction) {
      setLookupError('Please look up a valid transaction before saving an investigation.');
      return;
    }

    setSaveLoading(true);
    setSaveSuccessMsg(null);

    try {
      if (existingInvestigationId) {
        // Update existing investigation
        await updateInvestigation(existingInvestigationId, {
          transaction_id: currentTransaction.transaction_id,
          status,
          notes,
        });
        setSaveSuccessMsg(`Investigation case for Transaction #${currentTransaction.transaction_id} updated.`);
      } else {
        // Create new investigation
        const created = await createInvestigation({
          transaction_id: currentTransaction.transaction_id,
          status,
          notes,
        });
        if (created?.id) {
          setExistingInvestigationId(created.id);
        }
        setSaveSuccessMsg(`Investigation case file #${currentTransaction.transaction_id} opened successfully.`);
      }

      // Refresh investigations list
      await loadInvestigations();
    } catch (err) {
      console.error('Error saving investigation:', err);
      setLookupError('Failed to record investigation case. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Click on existing investigation item
  const handleSelectInvestigation = (inv) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setExistingInvestigationId(inv.id);
    setStatus(inv.status || 'OPEN');
    setNotes(inv.notes || '');
    setTransactionIdInput(String(inv.transaction_id));
    performLookup(inv.transaction_id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reasons = currentTransaction ? parseReasons(currentTransaction.reasons) : [];

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Forensic Case Investigation</h1>
          <p className="page-subtitle">
            Triage anomalous transactions, review graph risk indicators, and record AML compliance findings
          </p>
        </div>
        <div className="header-badge-count">
          <span className="count-pill text-emerald">
            {investigations.length} Active Dossiers
          </span>
        </div>
      </div>

      {/* Main Grid: Lookup & Dossier Editor */}
      <div className="investigation-grid">
        {/* Left Column: Transaction Finder & Risk Analysis */}
        <div className="investigation-left-panel">
          {/* Lookup Panel */}
          <div className="lookup-card glass-panel">
            <h3 className="card-section-title">Lookup Transaction</h3>
            <p className="card-section-subtitle">
              Enter any Transaction ID to inspect its forensic topology and flagged risk triggers
            </p>

            <form onSubmit={handleManualSearch} className="lookup-input-group mt-3">
              <input
                type="number"
                min="0"
                placeholder="Enter Transaction ID (e.g. 0, 1, 4)..."
                value={transactionIdInput}
                onChange={handleInputChange}
                className="filter-input"
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={lookupLoading || !transactionIdInput.trim()}
              >
                {lookupLoading ? 'Searching...' : 'Analyze Trace'}
              </button>
            </form>
          </div>

          {/* Dedicated Stable Profile Slot (Prevents Layout Shifts) */}
          <div className="investigation-profile-slot">
            {lookupLoading && !currentTransaction ? (
              <div className="investigation-standby-card glass-panel fade-in">
                <div className="spinner-ring" style={{ width: '36px', height: '36px', marginBottom: '12px' }}>
                  <div className="spinner-core"></div>
                </div>
                <h4 className="investigation-standby-title">Retrieving Telemetry</h4>
                <p className="investigation-standby-desc">
                  Querying transaction registry for Trace #{transactionIdInput.trim()}...
                </p>
              </div>
            ) : lookupError ? (
              <div className="investigation-standby-card glass-panel fade-in">
                <div className="empty-state-icon" style={{ color: '#f43f5e', marginBottom: '10px' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h4 className="investigation-standby-title text-danger">Trace Not Found</h4>
                <p className="investigation-standby-desc">{lookupError}</p>
              </div>
            ) : currentTransaction ? (
              <div className="transaction-profile-card glass-panel fade-in">
                <div className="profile-header-row">
                  <div>
                    <span className="hero-sublabel">LOADED RECORD</span>
                    <h3 className="profile-tx-id font-mono">
                      Transaction #{currentTransaction.transaction_id}
                    </h3>
                  </div>
                  <RiskBadge
                    level={currentTransaction.risk_level}
                    score={currentTransaction.risk_score}
                  />
                </div>

                <div className="profile-meta-grid mt-3">
                  <div className="profile-meta-item">
                    <span className="meta-label">Origin Account</span>
                    <strong className="font-mono">{currentTransaction.from_account}</strong>
                  </div>
                  <div className="profile-meta-item">
                    <span className="meta-label">Destination Account</span>
                    <strong className="font-mono">{currentTransaction.to_account}</strong>
                  </div>
                  <div className="profile-meta-item">
                    <span className="meta-label">Transfer Volume</span>
                    <strong className="font-mono text-emerald font-bold">
                      ${Number(currentTransaction.amount || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                  <div className="profile-meta-item">
                    <span className="meta-label">Recorded Timestamp</span>
                    <strong className="font-mono text-muted">
                      {currentTransaction.timestamp
                        ? currentTransaction.timestamp.replace('T', ' ')
                        : '—'}
                    </strong>
                  </div>
                </div>

                <div className="profile-reasons-section mt-3">
                  <h4 className="meta-label text-danger">Flagged AML Reasons</h4>
                  <div className="reason-chips-list">
                    {reasons.map((reason, idx) => (
                      <div key={idx} className="reason-chip">
                        <span className="reason-chip-dot" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="investigation-standby-card glass-panel fade-in">
                <div className="investigation-standby-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </div>
                <h4 className="investigation-standby-title">Awaiting Transaction Lookup</h4>
                <p className="investigation-standby-desc">
                  Type any Transaction ID (e.g. 0 to 482) above to review counterparty risk metrics and AML heuristic flags.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Case Management Form */}
        <div className="investigation-right-panel">
          <div className="case-form-card glass-panel">
            <div className="case-form-header">
              <div>
                <h3 className="card-section-title">
                  {existingInvestigationId ? 'Update Case Dossier' : 'Create Case Dossier'}
                </h3>
                <p className="card-section-subtitle">
                  {existingInvestigationId
                    ? `Modifying Case File #${existingInvestigationId} for Transaction #${currentTransaction?.transaction_id}`
                    : currentTransaction
                    ? `Open new AML case file for Transaction #${currentTransaction.transaction_id}`
                    : 'Select or lookup a transaction to begin investigation recording'}
                </p>
              </div>
              {existingInvestigationId && (
                <span className="existing-badge">Case File #{existingInvestigationId}</span>
              )}
            </div>

            {saveSuccessMsg && (
              <div className="alert-box alert-success mt-3 fade-in">
                <span className="alert-icon">✓</span>
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveInvestigation} className="investigation-form mt-4">
              <div className="form-group">
                <label className="form-label">Investigation Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="filter-select font-bold"
                  disabled={!currentTransaction || saveLoading}
                >
                  <option value="OPEN">📝 OPEN (Preliminary Review)</option>
                  <option value="UNDER_REVIEW">⏳ UNDER_REVIEW (In-Depth Audit)</option>
                  <option value="CLOSED">✅ CLOSED (Resolved / SAR Filed)</option>
                </select>
              </div>

              <div className="form-group mt-3">
                <label className="form-label">
                  Analyst Findings & SAR Notes
                  <span className="field-hint">
                    (Document counterparty risks, network clustering, or clearing determinations)
                  </span>
                </label>
                <textarea
                  rows="6"
                  placeholder={
                    currentTransaction
                      ? "Enter compliance notes, SAR recommendation, or investigation audit trail here..."
                      : "Lookup a transaction first to document case findings..."
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-textarea"
                  disabled={!currentTransaction || saveLoading}
                />
              </div>

              <div className="form-actions mt-4">
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={!currentTransaction || saveLoading}
                >
                  {saveLoading
                    ? 'Saving Case File...'
                    : existingInvestigationId
                    ? 'Update Investigation Dossier'
                    : 'Save & Open Investigation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Existing Investigations Table */}
      <div className="section-panel glass-panel mt-5">
        <div className="section-header">
          <div>
            <h3>Active Compliance Dossiers</h3>
            <p className="section-subtitle">
              Click any active case record to inspect telemetry and modify compliance notes
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadInvestigations}
            disabled={invLoading}
          >
            ↻ Refresh Cases
          </button>
        </div>

        {invLoading ? (
          <LoadingSpinner message="Loading investigation cases..." />
        ) : invError ? (
          <ErrorState
            title="Failed to Load Investigations"
            message={invError}
            onRetry={loadInvestigations}
          />
        ) : investigations.length === 0 ? (
          <div className="p-4 text-center text-muted">
            No active investigation cases recorded yet. Search a transaction above and click "Save & Open Investigation" to create the first case file.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="aml-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Transaction ID</th>
                  <th>Status</th>
                  <th>Analyst Notes Excerpt</th>
                  <th>Last Modified</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map((inv) => {
                  const isCurrent =
                    currentTransaction &&
                    String(currentTransaction.transaction_id) === String(inv.transaction_id);

                  return (
                    <tr
                      key={inv.id || inv.transaction_id}
                      className={`clickable-row ${isCurrent ? 'selected-row' : ''}`}
                      onClick={() => handleSelectInvestigation(inv)}
                    >
                      <td className="font-mono text-emerald">#{inv.id}</td>
                      <td className="font-mono font-bold">#{inv.transaction_id}</td>
                      <td>
                        <span
                          className={`badge ${
                            inv.status === 'CLOSED'
                              ? 'low'
                              : inv.status === 'UNDER_REVIEW'
                              ? 'medium'
                              : 'high'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="notes-excerpt">
                        {inv.notes ? (
                          inv.notes.length > 70 ? `${inv.notes.substring(0, 70)}...` : inv.notes
                        ) : (
                          <span className="text-muted italic">No notes recorded</span>
                        )}
                      </td>
                      <td className="font-mono text-muted text-sm">
                        {inv.updated_at
                          ? new Date(inv.updated_at).toLocaleString()
                          : inv.created_at
                          ? new Date(inv.created_at).toLocaleString()
                          : 'Recent'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-sm btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectInvestigation(inv);
                          }}
                        >
                          Load into Editor →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
