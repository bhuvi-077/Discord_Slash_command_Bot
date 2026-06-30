import React, { useState } from 'react';
import { api } from '../api';

export default function CommandConfigPanel({ serverId, commands, onUpdate }) {
  const [savingCmd, setSavingCmd] = useState(null);
  const [drafts, setDrafts] = useState({});

  const getDraft = (cmd) => drafts[cmd.command_name] ?? cmd.auto_reply ?? '';

  const handleToggle = async (cmd, field) => {
    setSavingCmd(cmd.command_name);
    try {
      await api.updateCommand(serverId, cmd.command_name, { [field]: !cmd[field] });
      onUpdate();
    } finally {
      setSavingCmd(null);
    }
  };

  const handleSaveReply = async (cmd) => {
    setSavingCmd(cmd.command_name);
    try {
      await api.updateCommand(serverId, cmd.command_name, { autoReply: getDraft(cmd) });
      onUpdate();
    } finally {
      setSavingCmd(null);
    }
  };

  if (!commands.length) {
    return <div className="cfg-empty">No commands configured for this server yet.</div>;
  }

  return (
    <div className="cfg-list">
      {commands.map((cmd) => (
        <div key={cmd.command_name} className="cfg-card">
          <div className="cfg-card-head">
            <span className="cfg-cmd-name">/{cmd.command_name}</span>
            <div className="cfg-toggles">
              <ToggleChip
                active={cmd.enabled}
                label="Enabled"
                onClick={() => handleToggle(cmd, 'enabled')}
                disabled={savingCmd === cmd.command_name}
              />
              <ToggleChip
                active={cmd.mirror_enabled}
                label="Mirror"
                onClick={() => handleToggle(cmd, 'mirror_enabled')}
                disabled={savingCmd === cmd.command_name}
              />
              {cmd.command_name === 'report' && (
                <ToggleChip
                  active={cmd.ai_enabled}
                  label="AI triage"
                  onClick={() => handleToggle(cmd, 'ai_enabled')}
                  disabled={savingCmd === cmd.command_name}
                />
              )}
            </div>
          </div>

          {(cmd.command_name === 'report' || cmd.command_name === 'status') && (
            <div className="cfg-reply">
              <label className="cfg-reply-label">
                Custom reply{' '}
                {cmd.command_name === 'report' && (
                  <span className="cfg-hint">— use {'{user}'}, {'{text}'}, {'{severity}'}</span>
                )}
              </label>
              <textarea
                rows={2}
                value={getDraft(cmd)}
                placeholder="Leave blank for the default reply"
                onChange={(e) => setDrafts((d) => ({ ...d, [cmd.command_name]: e.target.value }))}
              />
              <button
                className="cfg-save-btn"
                onClick={() => handleSaveReply(cmd)}
                disabled={savingCmd === cmd.command_name}
              >
                {savingCmd === cmd.command_name ? 'Saving…' : 'Save reply'}
              </button>
            </div>
          )}
        </div>
      ))}

      <style>{`
        .cfg-empty { color: var(--text-faint); padding: 24px; text-align: center; font-size: 13px; }
        .cfg-list { display: flex; flex-direction: column; gap: 10px; }
        .cfg-card {
          background: var(--bg-panel-raised);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 14px 16px;
        }
        .cfg-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }
        .cfg-cmd-name {
          font-family: var(--font-mono);
          color: var(--signal);
          font-size: 14px;
        }
        .cfg-toggles { display: flex; gap: 6px; }
        .cfg-reply { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
        .cfg-reply-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-faint);
        }
        .cfg-hint { text-transform: none; letter-spacing: 0; color: var(--text-faint); }
        .cfg-reply textarea {
          background: var(--bg-void);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          color: var(--text-primary);
          padding: 8px 10px;
          resize: vertical;
          font-size: 12.5px;
        }
        .cfg-reply textarea:focus { border-color: var(--signal); }
        .cfg-save-btn {
          align-self: flex-start;
          background: transparent;
          border: 1px solid var(--line-bright);
          color: var(--text-secondary);
          border-radius: var(--radius);
          padding: 5px 12px;
          font-size: 12px;
        }
        .cfg-save-btn:hover:not(:disabled) { border-color: var(--signal); color: var(--signal); }
        .cfg-save-btn:disabled { opacity: 0.5; }
      `}</style>
    </div>
  );
}

function ToggleChip({ active, label, onClick, disabled }) {
  return (
    <button
      className="toggle-chip"
      onClick={onClick}
      disabled={disabled}
      data-active={active}
      aria-pressed={active}
    >
      <span className="toggle-dot" />
      {label}
      <style>{`
        .toggle-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-void);
          border: 1px solid var(--line);
          color: var(--text-faint);
          border-radius: 999px;
          padding: 4px 10px 4px 8px;
          font-size: 11.5px;
        }
        .toggle-chip[data-active="true"] {
          border-color: var(--signal-dim);
          color: var(--signal);
        }
        .toggle-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--text-faint);
        }
        .toggle-chip[data-active="true"] .toggle-dot {
          background: var(--signal);
          box-shadow: 0 0 6px var(--signal);
        }
        .toggle-chip:disabled { opacity: 0.5; }
      `}</style>
    </button>
  );
}
