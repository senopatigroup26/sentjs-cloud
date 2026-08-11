-- Migration 005: permissions
CREATE TABLE IF NOT EXISTS permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    device_id       UUID NOT NULL REFERENCES devices(id),
    file_id         UUID REFERENCES files(id),
    action          VARCHAR(50) NOT NULL
                    CHECK (action IN ('export','copy','usb','print','screenshot')),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','denied','expired','revoked')),
    request_reason  TEXT,
    granted_by      UUID REFERENCES users(id),
    deny_reason     TEXT,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    used_at         TIMESTAMPTZ,
    used_count      INTEGER NOT NULL DEFAULT 0,
    max_uses        INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_user_id    ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_device_id  ON permissions(device_id);
CREATE INDEX IF NOT EXISTS idx_permissions_file_id    ON permissions(file_id);
CREATE INDEX IF NOT EXISTS idx_permissions_status     ON permissions(status);
CREATE INDEX IF NOT EXISTS idx_permissions_action     ON permissions(action);
CREATE INDEX IF NOT EXISTS idx_permissions_expires_at ON permissions(expires_at);

CREATE TRIGGER set_permissions_updated_at
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
