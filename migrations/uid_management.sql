ALTER TABLE users
    ADD COLUMN IF NOT EXISTS registered_by TEXT,
    ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_by TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE users
SET registered_at = COALESCE(registered_at, NOW()),
    updated_at = COALESCE(updated_at, registered_at, NOW())
WHERE registered_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE users
    ALTER COLUMN registered_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS users_uid_unique_idx ON users (uid);
CREATE UNIQUE INDEX IF NOT EXISTS users_discord_id_unique_idx ON users (discord_id);

CREATE TABLE IF NOT EXISTS uid_logs (
    id BIGSERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    old_uid TEXT,
    new_uid TEXT NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
