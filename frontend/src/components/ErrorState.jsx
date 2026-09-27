import React from 'react';

export default function ErrorState({
  title = 'Unable to Load AML Data',
  message = 'We encountered an issue connecting to the LaunderGraph analytics service. Please verify the backend service is running and try again.',
  onRetry,
}) {
  return (
    <div className="error-state-panel glass-panel">
      <div className="error-state-icon">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h3 className="error-state-title">{title}</h3>
      <p className="error-state-description">{message}</p>
      {onRetry && (
        <button type="button" className="btn-primary" onClick={onRetry}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Retry Connection
        </button>
      )}
    </div>
  );
}
