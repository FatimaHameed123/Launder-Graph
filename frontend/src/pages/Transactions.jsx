import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getTransactions } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 20;

export default function Transactions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state (derive risk from query parameter unless locally overridden)
  const queryRisk = searchParams.get('risk')?.toUpperCase() || 'ALL';
  const [localRiskFilter, setLocalRiskFilter] = useState(null);
  const riskFilter = localRiskFilter !== null ? localRiskFilter : queryRisk;

  const [searchTerm, setSearchTerm] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting state
  const [sortField, setSortField] = useState('timestamp'); // 'timestamp', 'amount', 'risk_score', 'transaction_id'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc', 'desc'

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  const loadTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransactions();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError('Unable to load transaction records from the backend API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getTransactions();
        if (active) {
          setTransactions(data.transactions || []);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error('Failed to fetch transactions:', err);
          setError('Unable to load transaction records from the backend API.');
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesId = tx.transaction_id.toString().toLowerCase().includes(term);
        const matchesFrom = (tx.from_account || '').toLowerCase().includes(term);
        const matchesTo = (tx.to_account || '').toLowerCase().includes(term);
        if (!matchesId && !matchesFrom && !matchesTo) {
          return false;
        }
      }

      // Risk level filter
      if (riskFilter !== 'ALL') {
        if ((tx.risk_level || '').toUpperCase() !== riskFilter) {
          return false;
        }
      }

      // Min amount
      if (minAmount !== '' && !isNaN(Number(minAmount))) {
        if (Number(tx.amount) < Number(minAmount)) {
          return false;
        }
      }

      // Max amount
      if (maxAmount !== '' && !isNaN(Number(maxAmount))) {
        if (Number(tx.amount) > Number(maxAmount)) {
          return false;
        }
      }

      // Date range filters
      if (startDate && tx.timestamp) {
        const txDate = tx.timestamp.slice(0, 10);
        if (txDate < startDate) {
          return false;
        }
      }
      if (endDate && tx.timestamp) {
        const txDate = tx.timestamp.slice(0, 10);
        if (txDate > endDate) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, searchTerm, riskFilter, minAmount, maxAmount, startDate, endDate]);

  // Sort logic
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'timestamp') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (sortField === 'amount' || sortField === 'risk_score' || sortField === 'transaction_id') {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTransactions, sortField, sortDirection]);

  // Pagination logic (safe clamping without cascading re-renders)
  const totalItems = sortedTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (activePage - 1) * PAGE_SIZE;
    return sortedTransactions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [sortedTransactions, activePage]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setLocalRiskFilter('ALL');
    setMinAmount('');
    setMaxAmount('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
    setSearchParams({});
  };

  const renderSortArrow = (field) => {
    if (sortField !== field) return <span className="sort-indicator inactive">⇅</span>;
    return <span className="sort-indicator active">{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  if (loading) {
    return <LoadingSpinner message="Scanning flagged transactions ledger..." />;
  }

  if (error && transactions.length === 0) {
    return (
      <ErrorState
        title="Ledger Unavailable"
        message="Unable to retrieve transaction list from FastAPI service at http://127.0.0.1:8000."
        onRetry={loadTransactions}
      />
    );
  }

  const startRecordIndex = totalItems === 0 ? 0 : (activePage - 1) * PAGE_SIZE + 1;
  const endRecordIndex = Math.min(activePage * PAGE_SIZE, totalItems);

  return (
    <div className="page-content pop-in">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Transaction Risk Ledger</h1>
          <p className="page-subtitle">
            Comprehensive audit database of all flagged money laundering telemetry
          </p>
        </div>
        <div className="header-badge-count">
          <span className="count-pill">{transactions.length} Records Ingested</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-controls-panel glass-panel">
        <div className="filters-grid">
          {/* Search box */}
          <div className="filter-item search-box-wrapper">
            <label className="filter-label">Search Identity</label>
            <div className="input-with-icon">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search ID, Origin, Target account..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="filter-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="input-clear-btn"
                  onClick={() => setSearchTerm('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Risk Level */}
          <div className="filter-item">
            <label className="filter-label">Risk Level</label>
            <select
              value={riskFilter}
              onChange={(e) => {
                const val = e.target.value;
                setLocalRiskFilter(val);
                setCurrentPage(1);
                if (val === 'ALL') {
                  setSearchParams({});
                } else {
                  setSearchParams({ risk: val });
                }
              }}
              className="filter-select"
            >
              <option value="ALL">🎯 All Severities</option>
              <option value="HIGH">🔴 High Risk</option>
              <option value="MEDIUM">🟡 Medium Risk</option>
              <option value="LOW">🟢 Low Risk</option>
            </select>
          </div>

          {/* Amount range */}
          <div className="filter-item">
            <label className="filter-label">Min Amount ($)</label>
            <input
              type="number"
              placeholder="Min volume"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-input"
            />
          </div>

          <div className="filter-item">
            <label className="filter-label">Max Amount ($)</label>
            <input
              type="number"
              placeholder="Max volume"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-input"
            />
          </div>

          {/* Date range */}
          <div className="filter-item">
            <label className="filter-label">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-input"
            />
          </div>

          <div className="filter-item">
            <label className="filter-label">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-input"
            />
          </div>
        </div>

        {/* Filter status row */}
        {(searchTerm || riskFilter !== 'ALL' || minAmount || maxAmount || startDate || endDate) && (
          <div className="active-filters-bar">
            <span className="active-filters-label">Active Filters:</span>
            {searchTerm && <span className="active-filter-tag">Search: "{searchTerm}"</span>}
            {riskFilter !== 'ALL' && <span className="active-filter-tag">Risk: {riskFilter}</span>}
            {minAmount && <span className="active-filter-tag">Min: ${Number(minAmount).toLocaleString()}</span>}
            {maxAmount && <span className="active-filter-tag">Max: ${Number(maxAmount).toLocaleString()}</span>}
            {startDate && <span className="active-filter-tag">From: {startDate}</span>}
            {endDate && <span className="active-filter-tag">To: {endDate}</span>}
            <button
              type="button"
              className="btn-text-emerald"
              onClick={handleResetFilters}
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Results Table or Empty State */}
      {paginatedTransactions.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="No transaction records match your current filter and search criteria."
          onReset={handleResetFilters}
        />
      ) : (
        <div className="section-panel glass-panel">
          <div className="table-responsive">
            <table className="aml-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('transaction_id')} className="sortable-header">
                    Trace ID {renderSortArrow('transaction_id')}
                  </th>
                  <th onClick={() => handleSort('timestamp')} className="sortable-header">
                    Timestamp {renderSortArrow('timestamp')}
                  </th>
                  <th>Origin Account</th>
                  <th>Target Account</th>
                  <th onClick={() => handleSort('amount')} className="sortable-header">
                    Transfer Volume ($) {renderSortArrow('amount')}
                  </th>
                  <th onClick={() => handleSort('risk_score')} className="sortable-header">
                    Risk Score {renderSortArrow('risk_score')}
                  </th>
                  <th>Severity</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx) => (
                  <tr
                    key={tx.transaction_id}
                    className="clickable-row"
                    onClick={() => navigate(`/transactions/${tx.transaction_id}`)}
                  >
                    <td className="font-mono text-emerald">#{tx.transaction_id}</td>
                    <td className="font-mono text-muted">
                      {tx.timestamp ? tx.timestamp.replace('T', ' ') : '—'}
                    </td>
                    <td className="font-mono">{tx.from_account}</td>
                    <td className="font-mono">{tx.to_account}</td>
                    <td className="font-mono font-bold">
                      ${Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <div className="score-cell">
                        <span className="font-mono">{tx.risk_score}</span>
                        <div className="mini-score-bar">
                          <div
                            className="mini-score-fill"
                            style={{ width: `${Math.min(100, (tx.risk_score || 0) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <RiskBadge level={tx.risk_level} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/transactions/${tx.transaction_id}`);
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing <span className="font-bold">{startRecordIndex}</span>–
              <span className="font-bold">{endRecordIndex}</span> of{' '}
              <span className="font-bold">{totalItems}</span> filtered records
            </div>

            <div className="pagination-controls">
              <button
                type="button"
                className="btn-page"
                disabled={activePage <= 1}
                onClick={() => setCurrentPage(Math.max(1, activePage - 1))}
              >
                ← Prev
              </button>

              {/* Numbered Page Buttons */}
              <div className="page-numbers">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    return (
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - activePage) <= 2
                    );
                  })
                  .map((pageNum, idx, arr) => {
                    const prevNum = arr[idx - 1];
                    const showEllipsis = prevNum && pageNum - prevNum > 1;

                    return (
                      <React.Fragment key={pageNum}>
                        {showEllipsis && <span className="pagination-ellipsis">…</span>}
                        <button
                          type="button"
                          className={`btn-page-number ${activePage === pageNum ? 'active' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                type="button"
                className="btn-page"
                disabled={activePage >= totalPages}
                onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
