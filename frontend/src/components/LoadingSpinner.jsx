import React from 'react';

export default function LoadingSpinner({ message = 'Loading AML Data...' }) {
  return (
    <div className="spinner-container">
      <div className="spinner-ring">
        <div className="spinner-core"></div>
      </div>
      <p className="spinner-text">{message}</p>
    </div>
  );
}
