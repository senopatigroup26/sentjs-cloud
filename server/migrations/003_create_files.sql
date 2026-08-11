-- Migration 003: files
CREATE TABLE IF NOT EXISTS files (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    remote_path         TEXT NOT NULL,
    local_path          TEXT NOT NULL,
    file_name           VARCHAR(500) NOT NULL,
    file_extension      VARCHAR(50),
    checksum_sha256     CHAR(64),
    size_bytes          BIGINT,
    mime_type           VARCHAR(200),
    status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending','uploading','uploaded',
                            'synced','cached','dehydrated','error'
                        )),
    last_accessed_at    TIMESTAMPTZ,
    last_modified_at    TIMESTAMPTZ,
    dehydrated_at       TIMESTAMPTZ,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_device_id    ON files(device_id);
CREATE INDEX IF NOT EXISTS idx_files_status       ON files(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_device_remote
    ON files(device_id, remote_path);
CREATE INDEX IF NOT EXISTS idx_files_checksum     ON files(checksum_sha256);

CREATE TRIGGER set_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
