import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import transactionsData from './data/flagged_transactions.json';
import './index.css';

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [selectedTx, setSelectedTx] = useState(null);
  const [investigationStatus, setInvestigationStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');

  // Filtering Logic
  const filteredData = transactionsData.filter(tx => {
    const matchesSearch = 
      tx.transaction_id.toString().includes(searchTerm) ||
      tx.from_account.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.to_account.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRisk = riskFilter === 'ALL' || tx.risk_level === riskFilter;
    
    return matchesSearch && matchesRisk;
  });

  // Summary Calculations
  const totalFlagged = transactionsData.length;
  const highRisk = transactionsData.filter(tx => tx.risk_level === 'HIGH').length;
  const mediumRisk = transactionsData.filter(tx => tx.risk_level === 'MEDIUM').length;

  const chartData = [
    { name: 'High Risk', value: highRisk },
    { name: 'Medium Risk', value: mediumRisk }
  ];
  const COLORS = ['#ef4444', '#f59e0b'];

  return (
    <div className="dashboard-container">
      <header>
        <h1>LaunderGraph — AML Investigation Dashboard</h1>
      </header>

      <div className="summary-cards">
        <div className="card"><h3>Total Flagged</h3><p>{totalFlagged}</p></div>
        <div className="card risk-high"><h3>High Risk</h3><p>{highRisk}</p></div>
        <div className="card risk-medium"><h3>Medium Risk</h3><p>{mediumRisk}</p></div>
        <div className="card"><h3>Open Investigations</h3><p>1</p></div>
      </div>

      <div className="main-content">
        <div className="left-panel">
          <div className="controls">
            <input 
              type="text" 
              placeholder="Search ID or Account..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              <option value="ALL">All Risks</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
            </select>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                  <th>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(tx => (
                  <tr key={tx.transaction_id} onClick={() => setSelectedTx(tx)} className="clickable-row">
                    <td>{tx.transaction_id}</td>
                    <td>{tx.from_account}</td>
                    <td>{tx.to_account}</td>
                    <td>${tx.amount.toFixed(2)}</td>
                    <td className={`badge ${tx.risk_level.toLowerCase()}`}>{tx.risk_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="right-panel">
          <div className="chart-container">
            <h3>Risk Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {selectedTx && (
            <div className="details-panel">
              <h3>Transaction Details</h3>
              <p><strong>ID:</strong> {selectedTx.transaction_id}</p>
              <p><strong>Route:</strong> {selectedTx.from_account} → {selectedTx.to_account}</p>
              <p><strong>Amount:</strong> ${selectedTx.amount}</p>
              <p><strong>Timestamp:</strong> {selectedTx.timestamp}</p>
              <p><strong>Risk Score:</strong> {selectedTx.risk_score}</p>
              
              <h4>ML Reasons:</h4>
              <ul>
                {selectedTx.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>

              <div className="investigation-ui">
                <h4>Investigation Status</h4>
                <select value={investigationStatus} onChange={(e) => setInvestigationStatus(e.target.value)}>
                  <option value="OPEN">OPEN</option>
                  <option value="UNDER_REVIEW">UNDER REVIEW</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
                <textarea 
                  placeholder="Investigation notes..." 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button onClick={() => alert('Investigation Saved!')}>Save Investigation</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}