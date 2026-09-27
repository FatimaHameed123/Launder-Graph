import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import TransactionDetails from './pages/TransactionDetails';
import Investigation from './pages/Investigation';
import { checkHealth } from './services/api';
import './index.css';

function MainLayout() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);

  // Periodic health check against FastAPI
  useEffect(() => {
    let isMounted = true;
    const verifyHealth = async () => {
      try {
        const res = await checkHealth();
        if (isMounted) setBackendOnline(res?.status === 'ok');
      } catch {
        if (isMounted) setBackendOnline(false);
      }
    };

    verifyHealth();
    const interval = setInterval(verifyHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-shell">
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      <div className="main-viewport">
        {/* Top Navbar */}
        <header className="topbar glass-panel">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            <div className={`system-live-badge ${backendOnline ? '' : 'offline'}`}>
              <span className="live-pulse" />
              <span>{backendOnline ? 'FastAPI Engine Connected' : 'Engine Offline'}</span>
            </div>
          </div>

          <div className="topbar-right">
            <div className="topbar-profile">
              <div className="profile-avatar">AML</div>
              <div className="profile-info desktop-only">
                <span className="profile-name">Senior Analyst</span>
                <span className="profile-role">Compliance Unit</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <main className="content-container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:id" element={<TransactionDetails />} />
            <Route path="/investigation" element={<Investigation />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MainLayout />
    </BrowserRouter>
  );
}