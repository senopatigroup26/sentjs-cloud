-- Migration 006: audit_logs (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    device_id   UUID REFERENCES devices(id),
    action      VARCHAR(100) NOT NULL,
    detail_json JSONB,
    ip_address  INET,
    user_agent  TEXT,
    severity    VARCHAR(20) NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info','warning','critical')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_device_id  ON audit_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity   ON audit_logs(severity);
