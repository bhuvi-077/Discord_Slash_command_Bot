const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getGuild, getGuildChannels } = require('../utils/discord');

router.use(requireAuth);

/**
 * GET /api/dashboard/stats
 * Quick overview numbers for the dashboard header.
 */
router.get('/stats', async (req, res) => {
  try {
    const [total, last24h, failed, servers] = await Promise.all([
      query('SELECT COUNT(*) FROM interactions'),
      query("SELECT COUNT(*) FROM interactions WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT COUNT(*) FROM interactions WHERE status = 'failed'"),
      query('SELECT COUNT(*) FROM servers'),
    ]);
    res.json({
      totalInteractions: parseInt(total.rows[0].count, 10),
      last24h: parseInt(last24h.rows[0].count, 10),
      failedCount: parseInt(failed.rows[0].count, 10),
      connectedServers: parseInt(servers.rows[0].count, 10),
    });
  } catch (err) {
    console.error('[Dashboard] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/**
 * GET /api/dashboard/interactions
 * Paginated live log of every command + action taken.
 */
router.get('/interactions', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const serverId = req.query.serverId || null;
  const commandName = req.query.command || null;
  const status = req.query.status || null;

  try {
    const conditions = [];
    const params = [];
    let i = 1;

    if (serverId) { conditions.push(`server_id = $${i++}`); params.push(serverId); }
    if (commandName) { conditions.push(`command_name = $${i++}`); params.push(commandName); }
    if (status) { conditions.push(`status = $${i++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT id, server_id, server_name, channel_id, user_id, username,
              command_name, command_options, status, response_text,
              ai_summary, mirrored, error_message, processing_ms, created_at
       FROM interactions ${where}
       ORDER BY created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(`SELECT COUNT(*) FROM interactions ${where}`, params);

    res.json({
      interactions: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[Dashboard] interactions error:', err.message);
    res.status(500).json({ error: 'Failed to load interactions' });
  }
});

/**
 * GET /api/dashboard/servers
 * List connected Discord servers.
 */
router.get('/servers', async (req, res) => {
  try {
    const result = await query('SELECT * FROM servers ORDER BY connected_at DESC');
    res.json({ servers: result.rows });
  } catch (err) {
    console.error('[Dashboard] servers error:', err.message);
    res.status(500).json({ error: 'Failed to load servers' });
  }
});

/**
 * GET /api/dashboard/servers/:id/channels
 * Fetch live channel list from Discord for the "pick a channel" UI.
 */
router.get('/servers/:id/channels', async (req, res) => {
  try {
    const channels = await getGuildChannels(req.params.id);
    res.json({ channels: channels.map(c => ({ id: c.id, name: c.name })) });
  } catch (err) {
    console.error('[Dashboard] channels error:', err.message);
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

/**
 * POST /api/dashboard/servers/:id/connect
 * Admin picks the notification channel for a server (the "connect" step).
 * If the server isn't in our DB yet, fetch its info from Discord and create it.
 */
router.post('/servers/:id/connect', async (req, res) => {
  const guildId = req.params.id;
  const { channelId, channelName } = req.body;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  try {
    let guildInfo = await query('SELECT * FROM servers WHERE id = $1', [guildId]);

    if (guildInfo.rows.length === 0) {
      const discordGuild = await getGuild(guildId);
      if (!discordGuild) {
        return res.status(404).json({ error: 'Bot is not in this server, or guild ID is invalid' });
      }
      await query(
        `INSERT INTO servers (id, name, icon, notification_channel_id, notification_channel_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [guildId, discordGuild.name, discordGuild.icon, channelId, channelName]
      );
    } else {
      await query(
        `UPDATE servers SET notification_channel_id = $2, notification_channel_name = $3, updated_at = NOW()
         WHERE id = $1`,
        [guildId, channelId, channelName]
      );
    }

    // Ensure default command configs exist for this server
    const defaultCommands = ['report', 'status', 'ping', 'help'];
    for (const cmd of defaultCommands) {
      await query(
        `INSERT INTO command_configs (server_id, command_name, enabled, mirror_enabled, ai_enabled)
         VALUES ($1, $2, TRUE, TRUE, $3)
         ON CONFLICT (server_id, command_name) DO NOTHING`,
        [guildId, cmd, cmd === 'report' && !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY)]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Dashboard] connect error:', err.message);
    res.status(500).json({ error: 'Failed to connect server' });
  }
});

/**
 * GET /api/dashboard/servers/:id/commands
 * Get command configs for a server (for the config UI).
 */
router.get('/servers/:id/commands', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM command_configs WHERE server_id = $1 ORDER BY command_name',
      [req.params.id]
    );
    res.json({ commands: result.rows });
  } catch (err) {
    console.error('[Dashboard] commands error:', err.message);
    res.status(500).json({ error: 'Failed to load command configs' });
  }
});

/**
 * PATCH /api/dashboard/servers/:id/commands/:commandName
 * Update a command's config — enabled, auto-reply, mirror, AI toggle.
 * This is the "configurable command rules in the UI" stretch goal.
 */
router.patch('/servers/:id/commands/:commandName', async (req, res) => {
  const { id, commandName } = req.params;
  const { enabled, autoReply, mirrorEnabled, aiEnabled } = req.body;

  try {
    const result = await query(
      `UPDATE command_configs SET
        enabled = COALESCE($3, enabled),
        auto_reply = COALESCE($4, auto_reply),
        mirror_enabled = COALESCE($5, mirror_enabled),
        ai_enabled = COALESCE($6, ai_enabled),
        updated_at = NOW()
       WHERE server_id = $1 AND command_name = $2
       RETURNING *`,
      [id, commandName, enabled, autoReply, mirrorEnabled, aiEnabled]
    );

    if (result.rows.length === 0) {
      // Config doesn't exist yet — create it
      const inserted = await query(
        `INSERT INTO command_configs (server_id, command_name, enabled, auto_reply, mirror_enabled, ai_enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, commandName, enabled ?? true, autoReply ?? null, mirrorEnabled ?? true, aiEnabled ?? false]
      );
      return res.json({ config: inserted.rows[0] });
    }

    res.json({ config: result.rows[0] });
  } catch (err) {
    console.error('[Dashboard] update command config error:', err.message);
    res.status(500).json({ error: 'Failed to update command config' });
  }
});

module.exports = router;
