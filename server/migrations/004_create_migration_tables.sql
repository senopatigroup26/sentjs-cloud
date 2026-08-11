-- Migration 004: migration_configs & migration_jobs
CREATE TABLE IF NOT EXISTS migration_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    folders         JSONB NOT NULL DEFAULT '[]',
    schedule        JSONB,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','paused','completed','cancelled')),
    notes           TEXT,
    activated_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_configs_device_id ON migration_configs(device_id);
CREATE INDEX IF NOT EXISTS idx_migration_configs_status    ON migration_configs(status);

CREATE TRIGGER set_migration_configs_updated_at
  BEFORE UPDATE ON migration_configs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Constraint: max 1 active config per device (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_configs_one_active
    ON migration_configs(device_id)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS migration_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id           UUID NOT NULL REFERENCES migration_configs(id),
    device_id           UUID NOT NULL REFERENCES devices(id),
    current_phase       VARCHAR(50) NOT NULL DEFAULT 'idle'
                        CHECK (current_phase IN (
                            'idle','scanning','hashing','uploading',
                            'verifying','dehydrating','completed','failed','paused'
                        )),
    total_files         INTEGER  NOT NULL DEFAULT 0,
    total_size_bytes    BIGINT   NOT NULL DEFAULT 0,
    scanned_count       INTEGER  NOT NULL DEFAULT 0,
    hashed_count        INTEGER  NOT NULL DEFAULT 0,
    uploaded_count      INTEGER  NOT NULL DEFAULT 0,
    verified_count      INTEGER  NOT NULL DEFAULT 0,
    dehydrated_count    INTEGER  NOT NULL DEFAULT 0,
    failed_count        INTEGER  NOT NULL DEFAULT 0,
    error_details       JSONB    DEFAULT '[]',
    started_at          TIMESTAMPTZ,
    paused_at           TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    last_progress_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_jobs_config_id  ON migration_jobs(config_id);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_device_id  ON migration_jobs(device_id);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_phase      ON migration_jobs(current_phase);

CREATE TRIGGER set_migration_jobs_updated_at
  BEFORE UPDATE ON migration_jobs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
