import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await login(username, password);
    setSubmitting(false);
  };

  return (
    <div className="login-screen">
      <div className="login-panel">
        <div className="login-mark">
          <span className="login-mark-dot" />
          COMMAND DECK
        </div>
        <p className="login-sub">Sign in to monitor and configure the bot.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="field">
            <span className="field-label">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <style>{`
        .login-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 50% 0%, rgba(94, 234, 212, 0.06), transparent 60%),
            var(--bg-void);
          padding: 24px;
        }
        .login-panel {
          width: 100%;
          max-width: 360px;
          background: var(--bg-panel);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 36px 32px;
        }
        .login-mark {
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.12em;
          color: var(--signal);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .login-mark-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--signal);
          box-shadow: 0 0 8px var(--signal);
        }
        .login-sub {
          color: var(--text-secondary);
          margin: 10px 0 28px;
          font-size: 13px;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-label {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-faint);
        }
        .field input {
          background: var(--bg-void);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 10px 12px;
          color: var(--text-primary);
        }
        .field input:focus {
          border-color: var(--signal);
        }
        .login-error {
          color: var(--red);
          font-size: 13px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
          padding: 8px 10px;
          border-radius: var(--radius);
        }
        .btn-primary {
          background: var(--signal);
          color: #0b0e0f;
          border: none;
          border-radius: var(--radius);
          padding: 11px;
          font-weight: 600;
          font-size: 14px;
          margin-top: 4px;
        }
        .btn-primary:hover { filter: brightness(1.08); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .boot-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          color: var(--text-faint);
          letter-spacing: 0.1em;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
