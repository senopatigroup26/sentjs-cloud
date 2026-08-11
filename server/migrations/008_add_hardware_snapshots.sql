-- Add hardware snapshot columns to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_fingerprint TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_snapshot JSONB;

-- Create index for fast hardware lookup
CREATE INDEX IF NOT EXISTS idx_devices_hardware_fingerprint ON devices(hardware_fingerprint);

-- Add comment
COMMENT ON COLUMN devices.hardware_fingerprint IS 'SHA256 hash of normalized hardware components (CPU+Mobo+BIOS)';
COMMENT ON COLUMN devices.hardware_snapshot IS 'Detailed hardware information snapshot';
