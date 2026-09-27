import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import transactionsData from './data/flagged_transactions.json';
import './index.css';

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [selectedTx, setSelectedTx] = useState(null);
  const [investigationStatus, setInvestigationStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');

  const filteredData = transactionsData.filter(tx => {
    const matchesSearch = 
      tx.transaction_id.toString().includes(searchTerm) ||
      tx.from_account.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.to_account.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || tx.risk_level === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const totalFlagged = transactionsData.length;
  const highRisk = transactionsData.filter(tx => tx.risk_level === 'HIGH').length;
  const mediumRisk = transactionsData.filter(tx => tx.risk_level === 'MEDIUM').length;

  const pieData = [
    { name: 'High Risk', value: highRisk > 0 ? highRisk : 1 },
    { name: 'Medium Risk', value: mediumRisk }
  ];
  const COLORS = ['#ef4444', '#f59e0b'];

  // Dummy data for visual volume chart
  const barData = [
    { day: 'Mon', volume: 12000 }, { day: 'Tue', volume: 19000 },
    { day: 'Wed', volume: 8000 }, { day: 'Thu', volume: 25000 },
    { day: 'Fri', volume: 13827 }
  ];

  return (
    <div className="dashboard-container">
      <header className="glass-panel">
        <div>
          <h1>LaunderGraph</h1>
          <p className="subtitle">Enterprise AML Network Analysis</p>
        </div>
        <div className="profile-badge">Admin Workspace</div>
      </header>

      <div className="summary-cards">
        <div className="card glass-panel"><h3>Total Flagged</h3><p className="metric">{totalFlagged}</p></div>
        <div className="card glass-panel risk-high"><h3>High Risk</h3><p className="metric">{highRisk}</p></div>
        <div className="card glass-panel risk-medium"><h3>Medium Risk</h3><p className="metric">{mediumRisk}</p></div>
        <div className="card glass-panel"><h3>Active Reviews</h3><p className="metric">1</p></div>
      </div>

      <div className="main-content">
        <div className="left-panel">
          <div className="controls glass-panel">
            <input 
              type="text" 
              placeholder="🔍 Search ID or Account..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              <option value="ALL">🎯 All Risk Levels</option>
              <option value="HIGH">🔴 High Risk</option>
              <option value="MEDIUM">🟡 Medium Risk</option>
            </select>
          </div>

          <div className="table-container glass-panel">
            <table>
              <thead>
                <tr>
                  <th>Trace ID</th>
                  <th>Origin Account</th>
                  <th>Target Account</th>
                  <th>Transfer Volume</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(tx => (
                  <tr key={tx.transaction_id} onClick={() => setSelectedTx(tx)} className="clickable-row">
                    <td className="font-mono">#{tx.transaction_id}</td>
                    <td className="font-mono">{tx.from_account}</td>
                    <td className="font-mono">{tx.to_account}</td>
                    <td className="font-bold">${tx.amount.toLocaleString()}</td>
                    <td><span className={`badge ${tx.risk_level.toLowerCase()}`}>{tx.risk_level}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="right-panel">
          <div className="chart-container glass-panel">
            <h3>Volume vs Time (Weekly)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                <Tooltip cursor={{fill: '#f1f5f9'}} />
                <Bar dataKey="volume" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container glass-panel">
            <h3>Risk Distribution</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {selectedTx && (
            <div className="details-panel glass-panel pop-in">
              <h3>Investigation Details</h3>
              <div className="detail-grid">
                <div><span>Origin:</span> <strong className="font-mono">{selectedTx.from_account}</strong></div>
                <div><span>Target:</span> <strong className="font-mono">{selectedTx.to_account}</strong></div>
                <div><span>Score:</span> <strong>{selectedTx.risk_score}/1.0</strong></div>
              </div>
              
              <h4>Trigger Rules</h4>
              <ul>
                {selectedTx.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>

              <div className="investigation-ui">
                <div className="flex-row">
                  <select value={investigationStatus} onChange={(e) => setInvestigationStatus(e.target.value)}>
                    <option value="OPEN">📝 OPEN</option>
                    <option value="UNDER_REVIEW">⏳ UNDER REVIEW</option>
                    <option value="CLOSED">✅ CLOSED</option>
                  </select>
                  <button onClick={() => alert('Saved to case file!')}>Update Status</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}