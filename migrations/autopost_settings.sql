CREATE TABLE IF NOT EXISTS autopost_settings (
    discord_id TEXT PRIMARY KEY,
    bot_token TEXT,
    webhook_url TEXT,
    channel_id TEXT,
    message_content TEXT,
    delay_seconds INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE autopost_settings
    ADD COLUMN IF NOT EXISTS bot_token TEXT,
    ADD COLUMN IF NOT EXISTS webhook_url TEXT,
    ADD COLUMN IF NOT EXISTS channel_id TEXT,
    ADD COLUMN IF NOT EXISTS message_content TEXT,
    ADD COLUMN IF NOT EXISTS delay_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS autopost_settings_discord_id_unique_idx
    ON autopost_settings (discord_id);
