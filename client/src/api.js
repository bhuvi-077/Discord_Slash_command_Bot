const API_BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  stats: () => request('/api/dashboard/stats'),
  interactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/dashboard/interactions${qs ? `?${qs}` : ''}`);
  },
  servers: () => request('/api/dashboard/servers'),
  serverChannels: (id) => request(`/api/dashboard/servers/${id}/channels`),
  connectServer: (id, channelId, channelName) =>
    request(`/api/dashboard/servers/${id}/connect`, {
      method: 'POST',
      body: JSON.stringify({ channelId, channelName }),
    }),
  serverCommands: (id) => request(`/api/dashboard/servers/${id}/commands`),
  updateCommand: (id, commandName, updates) =>
    request(`/api/dashboard/servers/${id}/commands/${commandName}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};
