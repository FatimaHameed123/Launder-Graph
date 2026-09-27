import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { getSummary, getTransactions, getInvestigations } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [sumData, txData, invData] = await Promise.all([
        getSummary(),
        getTransactions(),
        getInvestigations().catch(() => []),
      ]);

      setSummary(sumData);
      setTransactions(txData.transactions || []);
      setInvestigations(invData || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Unable to retrieve AML telemetry from the backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [sumData, txData, invData] = await Promise.all([
          getSummary(),
          getTransactions(),
          getInvestigations().catch(() => []),
        ]);
        if (active) {
          setSummary(sumData);
          setTransactions(txData.transactions || []);
          setInvestigations(invData || []);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error('Error loading dashboard data:', err);
          setError('Unable to retrieve AML telemetry from the backend.');
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <LoadingSpinner message="Aggregating AML network telemetry..." />;
  }

  if (error && !summary) {
    return (
      <ErrorState
        title="Dashboard Telemetry Error"
        message="Could not connect to the LaunderGraph analytics service. Check if FastAPI is running at http://127.0.0.1:8000."
        onRetry={() => fetchData(false)}
      />
    );
  }

  const totalFlagged = summary?.total_flagged ?? transactions.length;
  const highRisk = summary?.high_risk ?? transactions.filter((t) => t.risk_level === 'HIGH').length;
  const mediumRisk = summary?.medium_risk ?? transactions.filter((t) => t.risk_level === 'MEDIUM').length;
  const activeInvestigations = investigations.filter((i) => i.status !== 'CLOSED').length;

  // Build Real Daily Volume data for BarChart
  const dailyAgg = {};
  transactions.forEach((tx) => {
    if (tx.timestamp) {
      const dateKey = tx.timestamp.slice(5, 10); // MM-DD
      if (!dailyAgg[dateKey]) {
        dailyAgg[dateKey] = { date: dateKey, volume: 0, count: 0 };
      }
      dailyAgg[dateKey].volume += Number(tx.amount) || 0;
      dailyAgg[dateKey].count += 1;
    }
  });

  const barData = Object.values(dailyAgg)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7)
    .map((item) => ({
      date: item.date,
      volume: Math.round(item.volume),
      count: item.count,
    }));

  // Build Real Risk Breakdown for PieChart
  const pieData = [
    { name: 'High Risk', value: highRisk, color: '#f43f5e' },
    { name: 'Medium Risk', value: mediumRisk, color: '#fbbf24' },
  ].filter((item) => item.value > 0);

  const displayPieData = pieData.length > 0 ? pieData : [{ name: 'No Risk Data', value: 1, color: '#64748b' }];

  // Recent Flagged Transactions (sorted by risk_score desc, then timestamp desc, top 6)
  const recentTransactions = [...transactions]
    .sort((a, b) => {
      const scoreDiff = (b.risk_score || 0) - (a.risk_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    })
    .slice(0, 6);

  return (
    <div className="page-content pop-in">
      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Executive Risk Dashboard</h1>
          <p className="page-subtitle">Real-time anti-money laundering telemetry & anomalous transaction patterns</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Refresh latest data"
          >
            <span className={`refresh-icon ${refreshing ? 'spinning' : ''}`}>↻</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="summary-cards">
        <div
          className="card glass-panel clickable-card"
          onClick={() => navigate('/transactions')}
          title="View all transactions"
        >
          <div className="card-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h3>Total Flagged</h3>
          <p className="metric">{totalFlagged.toLocaleString()}</p>
          <div className="card-footer-caption">Across all monitored accounts</div>
        </div>

        <div
          className="card glass-panel risk-high clickable-card"
          onClick={() => navigate('/transactions?risk=HIGH')}
          title="Filter High Risk transactions"
        >
          <div className="card-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h3>High Risk</h3>
          <p className="metric">{highRisk.toLocaleString()}</p>
          <div className="card-footer-caption text-danger">Click to filter HIGH risk →</div>
        </div>

        <div
          className="card glass-panel risk-medium clickable-card"
          onClick={() => navigate('/transactions?risk=MEDIUM')}
          title="Filter Medium Risk transactions"
        >
          <div className="card-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3>Medium Risk</h3>
          <p className="metric">{mediumRisk.toLocaleString()}</p>
          <div className="card-footer-caption text-warning">Click to filter MEDIUM risk →</div>
        </div>

        <div
          className="card glass-panel clickable-card"
          onClick={() => navigate('/investigation')}
          title="Go to investigations"
        >
          <div className="card-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3>Active Reviews</h3>
          <p className="metric">{activeInvestigations}</p>
          <div className="card-footer-caption text-info">Manage case files →</div>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="charts-grid">
        <div className="chart-card glass-panel">
          <div className="chart-header">
            <div>
              <h3>Transfer Volume Timeline</h3>
              <p className="chart-subtitle">Aggregated transaction volume ($) per day</p>
            </div>
            <span className="chart-tag">REAL TELEMETRY</span>
          </div>
          <div className="chart-viewport">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                  formatter={(val) => [`$${Number(val).toLocaleString()}`, 'Transfer Volume']}
                  labelFormatter={(lbl) => `Date: ${lbl}`}
                />
                <Bar dataKey="volume" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass-panel">
          <div className="chart-header">
            <div>
              <h3>Risk Distribution</h3>
              <p className="chart-subtitle">Breakdown of evaluated transactions by severity</p>
            </div>
            <span className="chart-tag">MODEL SCORES</span>
          </div>
          <div className="chart-viewport">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={displayPieData}
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={displayPieData.length > 1 ? 5 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {displayPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                  }}
                  formatter={(val, name) => [`${val} transactions`, name]}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: '13px', color: '#94a3b8', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Flagged Transactions Section */}
      <div className="section-panel glass-panel mt-4">
        <div className="section-header">
          <div>
            <h3>Recent Flagged Transactions</h3>
            <p className="section-subtitle">Priority transactions flagged by network anomaly detection</p>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate('/transactions')}
          >
            View All Transactions ({transactions.length}) →
          </button>
        </div>

        <div className="table-responsive">
          <table className="aml-table">
            <thead>
              <tr>
                <th>Trace ID</th>
                <th>Timestamp</th>
                <th>Origin Account</th>
                <th>Target Account</th>
                <th>Amount</th>
                <th>Risk Score</th>
                <th>Severity</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((tx) => (
                <tr key={tx.transaction_id} className="clickable-row">
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
                    <span className="font-mono font-bold">
                      {tx.risk_score !== undefined ? `${tx.risk_score} / 1.0` : '—'}
                    </span>
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
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
