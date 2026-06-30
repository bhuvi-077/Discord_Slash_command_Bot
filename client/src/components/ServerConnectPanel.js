import React, { useState } from 'react';
import { api } from '../api';

export default function ServerConnectPanel({ servers, onConnected }) {
  const [guildId, setGuildId] = useState('');
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState(null);

  const handleFetchChannels = async () => {
    if (!guildId.trim()) return;
    setLoadingChannels(true);
    setErr(null);
    try {
      const data = await api.serverChannels(guildId.trim());
      setChannels(data.channels);
      if (!data.channels.length) {
        setErr('No text channels found — make sure the bot has been added to this server.');
      }
    } catch (e) {
      setErr(e.message);
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedChannel) return;
    setConnecting(true);
    setErr(null);
    try {
      const channel = channels.find((c) => c.id === selectedChannel);
      await api.connectServer(guildId.trim(), selectedChannel, channel?.name);
      setGuildId('');
      setChannels([]);
      setSelectedChannel('');
      onConnected();
    } catch (e) {
      setErr(e.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="connect-panel">
      <div className="connect-form">
        <div className="connect-row">
          <input
            type="text"
            placeholder="Discord server (guild) ID"
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
          />
          <button onClick={handleFetchChannels} disabled={loadingChannels || !guildId.trim()}>
            {loadingChannels ? 'Looking up…' : 'Find channels'}
          </button>
        </div>

        {channels.length > 0 && (
          <div className="connect-row">
            <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}>
              <option value="">Choose notification channel…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
            <button
              className="connect-btn"
              onClick={handleConnect}
              disabled={!selectedChannel || connecting}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        )}

        {err && <div className="connect-error">{err}</div>}
      </div>

      <div className="connect-list">
        {servers.length === 0 ? (
          <div className="connect-empty">No servers connected yet.</div>
        ) : (
          servers.map((s) => (
            <div key={s.id} className="connect-server-row">
              <span className="connect-server-name">{s.name}</span>
              <span className="connect-server-channel">#{s.notification_channel_name || '—'}</span>
            </div>
          ))
        )}
      </div>

      <style>{`
        .connect-panel { display: flex; flex-direction: column; gap: 16px; }
        .connect-form { display: flex; flex-direction: column; gap: 8px; }
        .connect-row { display: flex; gap: 8px; }
        .connect-row input, .connect-row select {
          flex: 1;
          background: var(--bg-void);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          color: var(--text-primary);
          padding: 8px 10px;
          font-size: 12.5px;
        }
        .connect-row input:focus, .connect-row select:focus { border-color: var(--signal); }
        .connect-row button {
          background: transparent;
          border: 1px solid var(--line-bright);
          color: var(--text-secondary);
          border-radius: var(--radius);
          padding: 8px 14px;
          font-size: 12.5px;
          white-space: nowrap;
        }
        .connect-row button:hover:not(:disabled) { border-color: var(--signal); color: var(--signal); }
        .connect-row button:disabled { opacity: 0.5; }
        .connect-btn { background: var(--signal) !important; color: #0b0e0f !important; border: none !important; font-weight: 600; }
        .connect-error {
          color: var(--red);
          font-size: 12px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
          padding: 7px 10px;
          border-radius: var(--radius);
        }
        .connect-list {
          border-top: 1px solid var(--line);
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .connect-empty { color: var(--text-faint); font-size: 12.5px; }
        .connect-server-row {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
          padding: 6px 0;
        }
        .connect-server-name { color: var(--text-primary); }
        .connect-server-channel { color: var(--text-faint); font-family: var(--font-mono); }
      `}</style>
    </div>
  );
}
