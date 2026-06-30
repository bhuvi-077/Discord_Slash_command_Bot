import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';
import InteractionLog from '../components/InteractionLog';
import CommandConfigPanel from '../components/CommandConfigPanel';
import ServerConnectPanel from '../components/ServerConnectPanel';

const POLL_INTERVAL = 8000;

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [commands, setCommands] = useState([]);
  const [filter, setFilter] = useState({ command: '', status: '' });
  const [tab, setTab] = useState('log'); // 'log' | 'configure'

  const loadStats = useCallback(async () => {
    try { setStats(await api.stats()); } catch {}
  }, []);

  const loadInteractions = useCallback(async () => {
    try {
      const params = {};
      if (filter.command) params.command = filter.command;
      if (filter.status) params.status = filter.status;
      const data = await api.interactions(params);
      setInteractions(data.interactions);
    } catch {} finally {
      setLoadingLog(false);
    }
  }, [filter]);

  const loadServers = useCallback(async () => {
    try {
      const data = await api.servers();
      setServers(data.servers);
      if (!activeServerId && data.servers.length) {
        setActiveServerId(data.servers[0].id);
      }
    } catch {}
  }, [activeServerId]);

  const loadCommands = useCallback(async () => {
    if (!activeServerId) return;
    try {
      const data = await api.serverCommands(activeServerId);
      setCommands(data.commands);
    } catch {}
  }, [activeServerId]);

  useEffect(() => { loadStats(); loadServers(); }, [loadStats, loadServers]);
  useEffect(() => { loadInteractions(); }, [loadInteractions]);
  useEffect(() => { loadCommands(); }, [loadCommands]);

  // Poll for live updates
  useEffect(() => {
    const id = setInterval(() => {
      loadStats();
      loadInteractions();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [loadStats, loadInteractions]);

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-mark">
          <span className="dash-mark-dot" />
          COMMAND DECK
        </div>
        <div className="dash-user">
          <span>{user?.username}</span>
          <button onClick={logout} className="dash-logout">Sign out</button>
        </div>
      </header>

      <section className="dash-stats">
        <StatCard label="Total commands" value={stats?.totalInteractions} />
        <StatCard label="Last 24h" value={stats?.last24h} accent />
        <StatCard label="Failed" value={stats?.failedCount} danger={stats?.failedCount > 0} />
        <StatCard label="Connected servers" value={stats?.connectedServers} />
      </section>

      <nav className="dash-tabs">
        <button data-active={tab === 'log'} onClick={() => setTab('log')}>Live log</button>
        <button data-active={tab === 'configure'} onClick={() => setTab('configure')}>Configure</button>
      </nav>

      {tab === 'log' && (
        <section className="dash-panel">
          <div className="panel-head">
            <h2>Interaction log</h2>
            <div className="panel-filters">
              <select value={filter.command} onChange={(e) => setFilter((f) => ({ ...f, command: e.target.value }))}>
                <option value="">All commands</option>
                <option value="report">/report</option>
                <option value="status">/status</option>
                <option value="ping">/ping</option>
                <option value="help">/help</option>
              </select>
              <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                <option value="processed">Processed</option>
                <option value="failed">Failed</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
          <InteractionLog interactions={interactions} loading={loadingLog} />
        </section>
      )}

      {tab === 'configure' && (
        <div className="dash-grid">
          <section className="dash-panel">
            <div className="panel-head"><h2>Connect a server</h2></div>
            <ServerConnectPanel servers={servers} onConnected={loadServers} />
          </section>

          <section className="dash-panel">
            <div className="panel-head">
              <h2>Command behavior</h2>
              {servers.length > 0 && (
                <select value={activeServerId || ''} onChange={(e) => setActiveServerId(e.target.value)}>
                  {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
            {activeServerId ? (
              <CommandConfigPanel serverId={activeServerId} commands={commands} onUpdate={loadCommands} />
            ) : (
              <div className="panel-empty">Connect a server first to configure its commands.</div>
            )}
          </section>
        </div>
      )}

      <style>{`
        .dash { max-width: 1100px; margin: 0 auto; padding: 0 24px 64px; }
        .dash-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 0;
          border-bottom: 1px solid var(--line);
          margin-bottom: 24px;
        }
        .dash-mark {
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.12em;
          color: var(--signal);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dash-mark-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--signal);
          box-shadow: 0 0 8px var(--signal);
        }
        .dash-user { display: flex; align-items: center; gap: 14px; color: var(--text-secondary); font-size: 13px; }
        .dash-logout {
          background: transparent;
          border: 1px solid var(--line-bright);
          color: var(--text-secondary);
          border-radius: var(--radius);
          padding: 6px 12px;
          font-size: 12.5px;
        }
        .dash-logout:hover { border-color: var(--signal); color: var(--signal); }

        .dash-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        @media (max-width: 700px) { .dash-stats { grid-template-columns: repeat(2, 1fr); } }

        .dash-tabs { display: flex; gap: 4px; margin-bottom: 16px; }
        .dash-tabs button {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--text-faint);
          padding: 7px 16px;
          border-radius: var(--radius);
          font-size: 13px;
        }
        .dash-tabs button[data-active="true"] {
          color: var(--signal);
          border-color: var(--signal-dim);
          background: var(--bg-panel);
        }

        .dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        @media (max-width: 860px) { .dash-grid { grid-template-columns: 1fr; } }

        .dash-panel {
          background: var(--bg-panel);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid var(--line);
          flex-wrap: wrap;
          gap: 10px;
        }
        .panel-head h2 { font-size: 14px; margin: 0; font-weight: 600; }
        .panel-filters { display: flex; gap: 8px; }
        .panel-filters select, .panel-head select {
          background: var(--bg-void);
          border: 1px solid var(--line);
          color: var(--text-secondary);
          border-radius: var(--radius);
          padding: 5px 8px;
          font-size: 12px;
        }
        .panel-empty { padding: 24px 18px; color: var(--text-faint); font-size: 13px; }
        .dash-grid .dash-panel > div:not(.panel-head) { padding: 18px; }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, accent, danger }) {
  return (
    <div className="stat-card">
      <div className="stat-value" data-tone={danger ? 'danger' : accent ? 'accent' : 'default'}>
        {value ?? '—'}
      </div>
      <div className="stat-label">{label}</div>
      <style>{`
        .stat-card {
          background: var(--bg-panel);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 16px 18px;
        }
        .stat-value {
          font-family: var(--font-mono);
          font-size: 26px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .stat-value[data-tone="accent"] { color: var(--signal); }
        .stat-value[data-tone="danger"] { color: var(--red); }
        .stat-label {
          color: var(--text-faint);
          font-size: 11.5px;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
      `}</style>
    </div>
  );
}
