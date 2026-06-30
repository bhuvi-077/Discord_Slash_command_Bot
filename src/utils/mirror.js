/**
 * Mirror notifications to a second channel.
 * Supports both Slack Incoming Webhooks and Discord channel webhooks.
 * Detects which format to use based on the URL.
 */

const MIRROR_URL = process.env.MIRROR_WEBHOOK_URL;

function isSlackWebhook(url) {
  return url?.includes('hooks.slack.com');
}

/**
 * Send a mirror notification. Tries up to 3 times with exponential backoff.
 * Never throws — always resolves (returns success boolean).
 */
async function mirrorNotification({ command, username, serverId, serverName, text, severity, aiResult }) {
  if (!MIRROR_URL) {
    console.warn('[Mirror] MIRROR_WEBHOOK_URL not set, skipping mirror');
    return false;
  }

  const severityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' }[severity] || '📨';
  const timestamp = new Date().toISOString();

  let payload;
  if (isSlackWebhook(MIRROR_URL)) {
    // Slack Block Kit format
    payload = {
      text: `${severityEmoji} New /${command} from ${username} in ${serverName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${severityEmoji} /${command} Command` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*User:*\n${username}` },
            { type: 'mrkdwn', text: `*Server:*\n${serverName}` },
            { type: 'mrkdwn', text: `*Severity:*\n${severity || 'N/A'}` },
            { type: 'mrkdwn', text: `*Time:*\n${timestamp}` },
          ],
        },
        text && {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Report:*\n${text}` },
        },
        aiResult && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*AI Summary:*\n${aiResult.summary}\n*Suggested Priority:* ${aiResult.suggested_priority}`,
          },
        },
        {
          type: 'divider',
        },
      ].filter(Boolean),
    };
  } else {
    // Discord webhook format
    const fields = [
      { name: 'User', value: username, inline: true },
      { name: 'Server', value: serverName, inline: true },
    ];
    if (severity) fields.push({ name: 'Severity', value: severityEmoji + ' ' + severity, inline: true });
    if (text) fields.push({ name: 'Report', value: text.substring(0, 1024), inline: false });
    if (aiResult) {
      fields.push({ name: '🤖 AI Summary', value: aiResult.summary, inline: false });
      fields.push({ name: 'Suggested Priority', value: aiResult.suggested_priority, inline: true });
      if (aiResult.tags?.length) {
        fields.push({ name: 'Tags', value: aiResult.tags.join(', '), inline: true });
      }
    }

    payload = {
      embeds: [
        {
          title: `${severityEmoji} New /${command} command`,
          color: { low: 0x57F287, medium: 0xFEE75C, high: 0xED4245, critical: 0xFF0000 }[severity] || 0x5865F2,
          fields,
          footer: { text: `Server ID: ${serverId}` },
          timestamp,
        },
      ],
    };
  }

  // Retry with backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(MIRROR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 204) {
        console.log(`[Mirror] ✅ Notification sent (attempt ${attempt})`);
        return true;
      }

      const errText = await res.text();
      console.error(`[Mirror] Attempt ${attempt} failed: ${res.status} ${errText.substring(0, 200)}`);
    } catch (err) {
      console.error(`[Mirror] Attempt ${attempt} network error:`, err.message);
    }

    if (attempt < 3) {
      const delay = attempt * 1000; // 1s, 2s
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error('[Mirror] ❌ All retry attempts failed');
  return false;
}

module.exports = { mirrorNotification };
