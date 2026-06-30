require('dotenv').config();

// Discord slash commands to register globally (or per-guild for faster updates during dev)
const commands = [
  {
    name: 'report',
    description: 'Submit a report or incident',
    options: [
      {
        name: 'text',
        description: 'What do you want to report?',
        type: 3, // STRING
        required: true,
      },
      {
        name: 'severity',
        description: 'How urgent is this?',
        type: 3, // STRING
        required: false,
        choices: [
          { name: '🟢 Low', value: 'low' },
          { name: '🟡 Medium', value: 'medium' },
          { name: '🔴 High', value: 'high' },
          { name: '🚨 Critical', value: 'critical' },
        ],
      },
    ],
  },
  {
    name: 'status',
    description: 'Check the current system status',
    options: [],
  },
  {
    name: 'ping',
    description: 'Check bot latency',
    options: [],
  },
  {
    name: 'help',
    description: 'Show available commands and how to use them',
    options: [],
  },
];

async function registerCommands() {
  const appId = process.env.DISCORD_APP_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_TEST_GUILD_ID; // optional: faster for dev

  if (!appId || !token) {
    console.error('Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN');
    process.exit(1);
  }

  // Use guild endpoint during dev (instant), global for production (up to 1hr)
  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  console.log(`[Register] Registering ${commands.length} commands ${guildId ? `to guild ${guildId}` : 'globally'}...`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[Register] ❌ Failed:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('[Register] ✅ Registered commands:');
  data.forEach(cmd => console.log(`  /${cmd.name} (id: ${cmd.id})`));
}

registerCommands().catch((err) => {
  console.error('[Register] Fatal:', err);
  process.exit(1);
});
