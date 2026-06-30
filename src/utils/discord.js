/**
 * Discord REST API helpers.
 * Used to send followup messages after deferring.
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Edit the deferred response (followup after DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE).
 */
async function editInteractionResponse(interactionToken, content) {
  const appId = process.env.DISCORD_APP_ID;
  const url = `${DISCORD_API}/webhooks/${appId}/${interactionToken}/messages/@original`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(
        typeof content === 'string'
          ? { content }
          : content
      ),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Discord] Failed to edit response:', res.status, err.substring(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Discord] editInteractionResponse error:', err.message);
    return false;
  }
}

/**
 * Send a message to a Discord channel via bot token.
 */
async function sendChannelMessage(channelId, content) {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(
        typeof content === 'string'
          ? { content }
          : content
      ),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Discord] Failed to send message:', res.status, err.substring(0, 200));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[Discord] sendChannelMessage error:', err.message);
    return null;
  }
}

/**
 * Get guild (server) info.
 */
async function getGuild(guildId) {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
      headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Get list of text channels in a guild.
 */
async function getGuildChannels(guildId) {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) return [];
    const channels = await res.json();
    // Return only text channels (type 0)
    return channels.filter(c => c.type === 0);
  } catch {
    return [];
  }
}

module.exports = {
  editInteractionResponse,
  sendChannelMessage,
  getGuild,
  getGuildChannels,
};
