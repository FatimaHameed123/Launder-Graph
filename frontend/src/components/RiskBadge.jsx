import React from 'react';

export default function RiskBadge({ level, score }) {
  const normalizedLevel = (level || 'LOW').toUpperCase();

  const getBadgeClass = () => {
    switch (normalizedLevel) {
      case 'HIGH':
        return 'badge-high';
      case 'MEDIUM':
        return 'badge-medium';
      case 'LOW':
      default:
        return 'badge-low';
    }
  };

  return (
    <span className={`risk-badge ${getBadgeClass()}`}>
      <span className="risk-indicator-dot" />
      <span>{normalizedLevel} RISK</span>
      {typeof score === 'number' && (
        <span className="risk-score-pill">{(score * 100).toFixed(0)}%</span>
      )}
    </span>
  );
}
