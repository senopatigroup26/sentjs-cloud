-- Migration 008: refresh_tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id    UUID REFERENCES devices(id) ON DELETE CASCADE,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    is_revoked   BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at   TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_device_id ON refresh_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires   ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash      ON refresh_tokens(token_hash);
