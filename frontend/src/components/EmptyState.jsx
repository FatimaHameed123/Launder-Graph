import React from 'react';

export default function EmptyState({
  title = 'No transactions found',
  description = 'Try changing your search or filters.',
  onReset = null,
  resetLabel = 'Clear Filters',
}) {
  return (
    <div className="empty-state-panel glass-panel">
      <div className="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      {onReset && (
        <button type="button" className="btn-secondary mt-3" onClick={onReset}>
          {resetLabel}
        </button>
      )}
    </div>
  );
}
