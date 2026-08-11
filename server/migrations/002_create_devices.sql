-- Migration 002: devices
CREATE TABLE IF NOT EXISTS devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    machine_name    VARCHAR(255) NOT NULL,
    machine_id      VARCHAR(255) NOT NULL UNIQUE,
    os_version      VARCHAR(100),
    client_version  VARCHAR(50),
    status          VARCHAR(50)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'suspended', 'decommissioned')),
    last_seen_at    TIMESTAMPTZ,
    last_ip         INET,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id    ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_machine_id ON devices(machine_id);
CREATE INDEX IF NOT EXISTS idx_devices_status     ON devices(status);

CREATE TRIGGER set_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
