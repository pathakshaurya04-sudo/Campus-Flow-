ALTER TABLE users
    ADD COLUMN IF NOT EXISTS refresh_token_version INTEGER NOT NULL DEFAULT 0
    CHECK (refresh_token_version >= 0);
