import React, { useState } from 'react';
import StatusBadge from './StatusBadge';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function InteractionLog({ interactions, loading }) {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) {
    return <div className="log-empty">Loading interaction log…</div>;
  }

  if (!interactions.length) {
    return (
      <div className="log-empty">
        No commands logged yet. Run <code>/report</code>, <code>/status</code>,{' '}
        <code>/ping</code>, or <code>/help</code> in your connected server to see activity here.
      </div>
    );
  }

  return (
    <div className="log-table">
      <div className="log-row log-row--head">
        <span>Command</span>
        <span>User</span>
        <span>Server</span>
        <span>Status</span>
        <span>Mirrored</span>
        <span>Latency</span>
        <span>When</span>
      </div>
      {interactions.map((row) => {
        const expanded = expandedId === row.id;
        return (
          <div key={row.id} className="log-group">
            <button
              className="log-row log-row--body"
              onClick={() => setExpandedId(expanded ? null : row.id)}
            >
              <span className="log-cmd">/{row.command_name || '—'}</span>
              <span>{row.username || '—'}</span>
              <span className="log-server">{row.server_name || row.server_id || '—'}</span>
              <span><StatusBadge status={row.status} /></span>
              <span className={row.mirrored ? 'log-mirror-yes' : 'log-mirror-no'}>
                {row.mirrored ? '✓' : '—'}
              </span>
              <span>{row.processing_ms != null ? `${row.processing_ms}ms` : '—'}</span>
              <span className="log-time">{timeAgo(row.created_at)}</span>
            </button>
            {expanded && (
              <div className="log-detail">
                {row.response_text && (
                  <div className="log-detail-block">
                    <div className="log-detail-label">Response sent</div>
                    <div className="log-detail-text">{row.response_text}</div>
                  </div>
                )}
                {row.ai_summary && (
                  <div className="log-detail-block">
                    <div className="log-detail-label">AI triage</div>
                    <pre className="log-detail-pre">{JSON.stringify(row.ai_summary, null, 2)}</pre>
                  </div>
                )}
                {row.error_message && (
                  <div className="log-detail-block">
                    <div className="log-detail-label log-detail-label--error">Error</div>
                    <div className="log-detail-text log-detail-text--error">{row.error_message}</div>
                  </div>
                )}
                <div className="log-detail-meta">
                  Interaction ID: <code>{row.id}</code> · Channel: <code>{row.channel_id || '—'}</code>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        .log-empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--text-faint);
          font-size: 13px;
        }
        .log-empty code {
          font-family: var(--font-mono);
          color: var(--text-secondary);
          background: var(--bg-void);
          padding: 1px 5px;
          border-radius: 2px;
        }
        .log-table {
          display: flex;
          flex-direction: column;
        }
        .log-row {
          display: grid;
          grid-template-columns: 100px 130px 1fr 90px 70px 70px 80px;
          gap: 12px;
          align-items: center;
          padding: 10px 16px;
          font-size: 12.5px;
        }
        .log-row--head {
          color: var(--text-faint);
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border-bottom: 1px solid var(--line);
        }
        .log-row--body {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--line);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
        }
        .log-row--body:hover { background: var(--bg-panel-raised); }
        .log-cmd {
          font-family: var(--font-mono);
          color: var(--signal);
        }
        .log-server, .log-time { color: var(--text-secondary); }
        .log-mirror-yes { color: var(--signal); }
        .log-mirror-no { color: var(--text-faint); }
        .log-detail {
          padding: 14px 16px 18px 16px;
          background: var(--bg-void);
          border-bottom: 1px solid var(--line);
          font-size: 12.5px;
        }
        .log-detail-block { margin-bottom: 10px; }
        .log-detail-label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-faint);
          margin-bottom: 4px;
        }
        .log-detail-label--error { color: var(--red); }
        .log-detail-text { color: var(--text-secondary); white-space: pre-wrap; }
        .log-detail-text--error { color: var(--red); }
        .log-detail-pre {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--bg-panel);
          padding: 8px 10px;
          border-radius: var(--radius);
          overflow-x: auto;
        }
        .log-detail-meta {
          color: var(--text-faint);
          font-size: 11px;
          margin-top: 8px;
        }
        .log-detail-meta code {
          font-family: var(--font-mono);
          color: var(--text-secondary);
        }
        @media (max-width: 760px) {
          .log-row { grid-template-columns: 1fr; gap: 4px; }
          .log-row--head { display: none; }
        }
      `}</style>
    </div>
  );
}
