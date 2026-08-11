-- Migration 007: usb_policies
CREATE TABLE IF NOT EXISTS usb_policies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE UNIQUE,
    policy              VARCHAR(50) NOT NULL DEFAULT 'block'
                        CHECK (policy IN ('block','allow','require_permission')),
    allow_known_devices BOOLEAN NOT NULL DEFAULT FALSE,
    whitelisted_usb     JSONB DEFAULT '[]',
    updated_by          UUID NOT NULL REFERENCES users(id),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usb_policies_device_id ON usb_policies(device_id);

CREATE TRIGGER set_usb_policies_updated_at
  BEFORE UPDATE ON usb_policies
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
