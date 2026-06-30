import React from 'react';

const STATUS_STYLES = {
  processed: { color: 'var(--signal)', label: 'OK' },
  received: { color: 'var(--amber)', label: 'PENDING' },
  failed: { color: 'var(--red)', label: 'FAILED' },
  disabled: { color: 'var(--text-faint)', label: 'DISABLED' },
  unknown: { color: 'var(--text-faint)', label: 'UNKNOWN' },
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.unknown;
  return (
    <span
      className="status-badge"
      style={{ color: style.color, borderColor: style.color }}
    >
      {style.label}
      <style>{`
        .status-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 2px 7px;
          border: 1px solid;
          border-radius: 2px;
          white-space: nowrap;
        }
      `}</style>
    </span>
  );
}
