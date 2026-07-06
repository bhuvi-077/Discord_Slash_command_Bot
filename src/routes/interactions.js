const { query } = require('../db');
const { analyzeReport, formatAiResultForDiscord } = require('../utils/ai');
const { mirrorNotification } = require('../utils/mirror');
const { editInteractionResponse, sendChannelMessage } = require('../utils/discord');

// Interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
};

// Response types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

/**
 * Get command config for a server, with fallback defaults.
 */
async function getCommandConfig(serverId, commandName) {
  try {
    const result = await query(
      'SELECT * FROM command_configs WHERE server_id = $1 AND command_name = $2',
      [serverId, commandName]
    );
    return result.rows[0] || {
      enabled: true,
      auto_reply: null,
      mirror_enabled: true,
      ai_enabled: !!process.env.GEMINI_API_KEY,
    };
  } catch {
    return { enabled: true, auto_reply: null, mirror_enabled: true, ai_enabled: false };
  }
}

/**
 * Get server config (notification channel).
 */
async function getServerConfig(serverId) {
  try {
    const result = await query('SELECT * FROM servers WHERE id = $1', [serverId]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check and record interaction for deduplication.
 * Returns true if this is a new interaction (should process).
 * Returns false if already seen (duplicate — skip).
 */
async function deduplicateInteraction(interactionId, payload) {
  try {
    // Attempt INSERT with conflict on PK
    const result = await query(
      `INSERT INTO interactions (id, raw_payload, status, created_at)
       VALUES ($1, $2, 'received', NOW())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [interactionId, JSON.stringify(payload)]
    );
    return result.rowCount > 0; // true = inserted (new), false = duplicate
  } catch (err) {
    console.error('[Dedup] Error:', err.message);
    return true; // On error, allow processing (better than silent drop)
  }
}

/**
 * Update interaction record with processing results.
 */
async function updateInteraction(id, data) {
  try {
    await query(
      `UPDATE interactions SET
        server_id = $2, server_name = $3, channel_id = $4,
        user_id = $5, username = $6, command_name = $7,
        command_options = $8, status = $9, response_text = $10,
        ai_summary = $11, mirrored = $12, error_message = $13,
        processing_ms = $14
       WHERE id = $1`,
      [
        id,
        data.serverId, data.serverName, data.channelId,
        data.userId, data.username, data.commandName,
        JSON.stringify(data.options || {}), data.status, data.responseText,
        data.aiSummary ? JSON.stringify(data.aiSummary) : null,
        data.mirrored || false, data.errorMessage || null,
        data.processingMs || null,
      ]
    );
  } catch (err) {
    console.error('[DB] Failed to update interaction:', err.message);
  }
}

/**
 * Process /report command — the main meat.
 * Deferred because it may call AI + mirror (slow).
 */
async function handleReport(interaction, config, serverConfig, startTime) {
  const { id, token, guild_id, channel_id, member, data } = interaction;
  const username = member?.user?.username || member?.nick || 'Unknown';
  const userId = member?.user?.id;
  const serverName = interaction.guild?.name || serverConfig?.name || guild_id;

  const options = {};
  data.options?.forEach(opt => { options[opt.name] = opt.value; });
  const reportText = options.text || '';
  const severity = options.severity || 'medium';

  let aiResult = null;
  let aiSummary = null;

  // AI analysis (if enabled for this command)
  if (config.ai_enabled) {
    try {
      aiResult = await analyzeReport(reportText, severity);
      aiSummary = aiResult;
    } catch (err) {
      console.error('[AI] analyzeReport threw:', err.message);
    }
  }

  // Build Discord response
  const severityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' }[severity] || '📨';
  let responseText = config.auto_reply
    ? config.auto_reply
        .replace('{user}', username)
        .replace('{text}', reportText)
        .replace('{severity}', severity)
    : `✅ **Report received!** Thanks, ${username}.\n📝 **"${reportText}"**\n${severityEmoji} Severity: **${severity}**`;

  if (aiResult) {
    responseText += formatAiResultForDiscord(aiResult);
  }

  // Send followup (edit deferred message)
  await editInteractionResponse(token, {
    content: responseText,
    flags: 64, // EPHEMERAL — only visible to the user who ran the command
  });

  // Post to configured server channel (non-ephemeral, visible to everyone)
  if (serverConfig?.notification_channel_id) {
    const channelMsg = {
      embeds: [{
        title: `${severityEmoji} New Report`,
        description: reportText,
        color: { low: 0x57F287, medium: 0xFEE75C, high: 0xED4245, critical: 0xFF0000 }[severity] || 0x5865F2,
        fields: [
          { name: 'Reporter', value: `<@${userId}>`, inline: true },
          { name: 'Severity', value: `${severityEmoji} ${severity}`, inline: true },
          ...(aiResult ? [
            { name: '🤖 AI Summary', value: aiResult.summary, inline: false },
            { name: 'Tags', value: aiResult.tags?.join(', ') || 'none', inline: true },
          ] : []),
        ],
        timestamp: new Date().toISOString(),
      }],
    };
    await sendChannelMessage(serverConfig.notification_channel_id, channelMsg);
  }

  // Mirror to second channel
  let mirrored = false;
  if (config.mirror_enabled) {
    mirrored = await mirrorNotification({
      command: 'report',
      username,
      serverId: guild_id,
      serverName,
      text: reportText,
      severity,
      aiResult,
    });
  }

  const processingMs = Date.now() - startTime;
  await updateInteraction(id, {
    serverId: guild_id, serverName, channelId: channel_id,
    userId, username, commandName: 'report',
    options, status: 'processed', responseText,
    aiSummary, mirrored, processingMs,
  });
}

/**
 * Process /status command — returns real live stats from the database,
 * matching what the admin dashboard shows, plus the current interaction details.
 */
async function handleStatus(interaction, config, serverConfig, startTime) {
  const { id, token, guild_id, channel_id, member } = interaction;
  const username = member?.user?.username || 'Unknown';
  const serverName = serverConfig?.name || guild_id;

  // Interaction type names for display
  const interactionTypeNames = {
    1: 'PING',
    2: 'APPLICATION_COMMAND (Slash Command)',
    3: 'MESSAGE_COMPONENT (Button/Menu)',
    5: 'MODAL_SUBMIT',
  };
  const interactionTypeName = interactionTypeNames[interaction.type] || `UNKNOWN (${interaction.type})`;

  let responseText;

  try {
    // Fetch real live stats from the database — same data as the dashboard
    const [total, last24h, failed, servers, lastInteraction] = await Promise.all([
      query('SELECT COUNT(*) FROM interactions'),
      query("SELECT COUNT(*) FROM interactions WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT COUNT(*) FROM interactions WHERE status = 'failed'"),
      query('SELECT COUNT(*) FROM servers'),
      query("SELECT id, command_name, status, created_at FROM interactions ORDER BY created_at DESC LIMIT 1"),
    ]);

    const totalCount    = parseInt(total.rows[0].count, 10);
    const last24hCount  = parseInt(last24h.rows[0].count, 10);
    const failedCount   = parseInt(failed.rows[0].count, 10);
    const serversCount  = parseInt(servers.rows[0].count, 10);
    const lastRow       = lastInteraction.rows[0];

    // Use custom reply if set, otherwise show full live stats
    if (config.auto_reply) {
      responseText = config.auto_reply;
      await editInteractionResponse(token, { content: responseText });
    } else {
      await editInteractionResponse(token, {
        embeds: [{
          title: '📊 Command Deck — Live Status',
          color: 0x5eead4,
          fields: [
            // Dashboard stats
            {
              name: '📈 Total Commands',
              value: `\`${totalCount}\``,
              inline: true,
            },
            {
              name: '🕐 Last 24 Hours',
              value: `\`${last24hCount}\``,
              inline: true,
            },
            {
              name: '❌ Failed',
              value: failedCount > 0 ? `\`${failedCount}\`` : '`0`',
              inline: true,
            },
            {
              name: '🖥️ Connected Servers',
              value: `\`${serversCount}\``,
              inline: true,
            },
            {
              name: '✅ System',
              value: '`Operational`',
              inline: true,
            },
            {
              name: '⚡ Uptime',
              value: '`Online`',
              inline: true,
            },
            // Last interaction details
            ...(lastRow ? [{
              name: '🕵️ Last Interaction',
              value: [
                `ID: \`${lastRow.id}\``,
                `Command: \`/${lastRow.command_name}\``,
                `Status: \`${lastRow.status}\``,
                `Time: <t:${Math.floor(new Date(lastRow.created_at).getTime() / 1000)}:R>`,
              ].join('\n'),
              inline: false,
            }] : []),
            // Current interaction details
            {
              name: '🔍 This Interaction',
              value: [
                `ID: \`${id}\``,
                `Type: \`${interactionTypeName}\``,
                `Requested by: \`${username}\``,
                `Server: \`${serverName}\``,
              ].join('\n'),
              inline: false,
            },
          ],
          footer: {
            text: `Checked by ${username} • Command Deck Bot`,
          },
          timestamp: new Date().toISOString(),
        }],
      });
      responseText = `Live stats shown — ${totalCount} total, ${last24hCount} last 24h, ${failedCount} failed`;
    }
  } catch (err) {
    // Fallback if DB query fails
    console.error('[Status] DB query failed:', err.message);
    responseText = '✅ Bot is online and running. Could not fetch live stats right now.';
    await editInteractionResponse(token, { content: responseText });
  }

  let mirrored = false;
  if (config.mirror_enabled) {
    mirrored = await mirrorNotification({
      command: 'status',
      username,
      serverId: guild_id,
      serverName,
      text: 'Status check requested',
    });
  }

  const processingMs = Date.now() - startTime;
  await updateInteraction(id, {
    serverId: guild_id, serverName, channelId: channel_id,
    userId: member?.user?.id, username, commandName: 'status',
    options: {}, status: 'processed', responseText,
    mirrored, processingMs,
  });
}

/**
 * Process /ping command.
 */
async function handlePing(interaction, startTime) {
  const { id, token, guild_id, channel_id, member } = interaction;
  const username = member?.user?.username || 'Unknown';
  const latency = Date.now() - startTime;

  await editInteractionResponse(token, {
    content: `🏓 Pong! Latency: **${latency}ms**`,
  });

  await updateInteraction(id, {
    serverId: guild_id, channelId: channel_id,
    userId: member?.user?.id, username, commandName: 'ping',
    options: {}, status: 'processed',
    responseText: `Pong! Latency: ${latency}ms`,
    processingMs: latency,
  });
}

/**
 * Process /help command.
 */
async function handleHelp(interaction, startTime) {
  const { id, token, guild_id, channel_id, member } = interaction;
  const username = member?.user?.username || 'Unknown';

  const helpText = [
    '📖 **Available Commands**',
    '',
    '`/report <text> [severity]` — Submit a report or incident',
    '  Severity options: 🟢 low, 🟡 medium, 🔴 high, 🚨 critical',
    '',
    '`/status` — Check current system status',
    '',
    '`/ping` — Check bot latency',
    '',
    '`/help` — Show this message',
  ].join('\n');

  await editInteractionResponse(token, { content: helpText });

  await updateInteraction(id, {
    serverId: guild_id, channelId: channel_id,
    userId: member?.user?.id, username, commandName: 'help',
    options: {}, status: 'processed', responseText: helpText,
    processingMs: Date.now() - startTime,
  });
}

/**
 * Main interaction handler.
 * Returns the immediate HTTP response to Discord, then processes async.
 */
async function handleInteraction(req, res) {
  const interaction = req.body;
  const startTime = Date.now();

  // Handle PING (Discord endpoint verification)
  if (interaction.type === InteractionType.PING) {
    console.log('[Interactions] PING received — responding with PONG');
    return res.json({ type: InteractionResponseType.PONG });
  }

  // Handle slash commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { id, guild_id, data } = interaction;
    const commandName = data?.name;

    console.log(`[Interactions] Command: /${commandName} | Guild: ${guild_id} | ID: ${id}`);

    // Deduplication check
    const isNew = await deduplicateInteraction(id, interaction);
    if (!isNew) {
      console.warn(`[Interactions] Duplicate interaction ${id} — skipping`);
      // Still must respond to Discord within 3s
      return res.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '_(duplicate request ignored)_', flags: 64 },
      });
    }

    // Immediately defer to avoid Discord's 3s timeout
    // This sends "Bot is thinking..." while we do slow work
    res.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: 64 } });

    // Process asynchronously (after response sent)
    setImmediate(async () => {
      try {
        const [config, serverConfig] = await Promise.all([
          getCommandConfig(guild_id, commandName),
          getServerConfig(guild_id),
        ]);

        if (!config.enabled) {
          await editInteractionResponse(interaction.token, {
            content: `⚠️ The \`/${commandName}\` command is currently disabled.`,
          });
          await updateInteraction(id, {
            serverId: guild_id, channelId: interaction.channel_id,
            username: interaction.member?.user?.username,
            commandName, status: 'disabled', processingMs: Date.now() - startTime,
          });
          return;
        }

        switch (commandName) {
          case 'report':
            await handleReport(interaction, config, serverConfig, startTime);
            break;
          case 'status':
            await handleStatus(interaction, config, serverConfig, startTime);
            break;
          case 'ping':
            await handlePing(interaction, startTime);
            break;
          case 'help':
            await handleHelp(interaction, startTime);
            break;
          default:
            await editInteractionResponse(interaction.token, {
              content: `Unknown command: \`/${commandName}\``,
            });
            await updateInteraction(id, {
              serverId: guild_id, channelId: interaction.channel_id,
              username: interaction.member?.user?.username,
              commandName, status: 'unknown', processingMs: Date.now() - startTime,
            });
        }
      } catch (err) {
        console.error('[Interactions] Processing error:', err);
        // Best-effort error reply
        try {
          await editInteractionResponse(interaction.token, {
            content: '❌ An error occurred processing your command. Please try again.',
          });
        } catch {}
        await updateInteraction(interaction.id, {
          serverId: guild_id, commandName,
          status: 'failed', errorMessage: err.message,
          processingMs: Date.now() - startTime,
        });
      }
    });

    return; // Response already sent via res.json above
  }

  // Unknown interaction type
  console.warn('[Interactions] Unknown interaction type:', interaction.type);
  return res.status(400).json({ error: 'Unknown interaction type' });
}

module.exports = { handleInteraction };