require('dotenv').config();
const { query } = require('../src/db');

async function setupDatabase() {
  console.log('[Setup] Creating database tables...');

  // Sessions table (for connect-pg-simple)
  await query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    )
    WITH (OIDS=FALSE);
  `);
  await query(`
    ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  `).catch(() => {}); // ignore if already exists
  await query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  // Servers table: each Discord server that has connected the bot
  await query(`
    CREATE TABLE IF NOT EXISTS servers (
      id VARCHAR(20) PRIMARY KEY,           -- Discord guild ID
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(255),
      notification_channel_id VARCHAR(20),  -- channel the bot posts to
      notification_channel_name VARCHAR(255),
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Command configs: per-server configurable behavior
  await query(`
    CREATE TABLE IF NOT EXISTS command_configs (
      id SERIAL PRIMARY KEY,
      server_id VARCHAR(20) REFERENCES servers(id) ON DELETE CASCADE,
      command_name VARCHAR(100) NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      auto_reply TEXT,                       -- custom reply text
      mirror_enabled BOOLEAN DEFAULT TRUE,  -- mirror to second channel?
      ai_enabled BOOLEAN DEFAULT FALSE,     -- run AI on this command?
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(server_id, command_name)
    );
  `);

  // Interactions log: every slash command that arrives
  await query(`
    CREATE TABLE IF NOT EXISTS interactions (
      id VARCHAR(36) PRIMARY KEY,            -- Discord interaction ID (for dedup)
      server_id VARCHAR(20),
      server_name VARCHAR(255),
      channel_id VARCHAR(20),
      user_id VARCHAR(20),
      username VARCHAR(255),
      command_name VARCHAR(100),
      command_options JSONB,                 -- full options payload
      raw_payload JSONB,                     -- original Discord payload
      status VARCHAR(50) DEFAULT 'received', -- received|processed|failed
      response_text TEXT,                    -- what we replied in Discord
      ai_summary TEXT,                       -- AI analysis if enabled
      mirrored BOOLEAN DEFAULT FALSE,
      error_message TEXT,
      processing_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Index for dashboard queries
  await query(`
    CREATE INDEX IF NOT EXISTS idx_interactions_server ON interactions(server_id);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at DESC);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_interactions_command ON interactions(command_name);
  `);

  console.log('[Setup] ✅ Database tables ready');
  process.exit(0);
}

setupDatabase().catch((err) => {
  console.error('[Setup] ❌ Failed:', err);
  process.exit(1);
});
