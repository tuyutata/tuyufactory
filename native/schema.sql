BEGIN;

CREATE SCHEMA IF NOT EXISTS tuyu_core;

CREATE TABLE IF NOT EXISTS tuyu_core.installation (
    initialized_at timestamptz,
    id uuid PRIMARY KEY,
    instance_name text NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'retired')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS tuyu_core.local_system_administrator (
    id uuid PRIMARY KEY,
    installation_id uuid NOT NULL REFERENCES tuyu_core.installation(id) ON DELETE CASCADE,
    public_key bytea NOT NULL CHECK (octet_length(public_key) = 32),
    name varchar(30),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (installation_id, public_key),
    CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 30)
);

CREATE TABLE IF NOT EXISTS tuyu_core.administrator_audit_log (
    id uuid PRIMARY KEY,
    installation_id uuid NOT NULL REFERENCES tuyu_core.installation(id) ON DELETE CASCADE,
    administrator_id uuid REFERENCES tuyu_core.local_system_administrator(id) ON DELETE SET NULL,
    actor_public_key_fingerprint char(64),
    target_administrator_id uuid REFERENCES tuyu_core.local_system_administrator(id)
        ON DELETE SET NULL,
    target_public_key_fingerprint char(64) NOT NULL,
    session_id uuid,
    action text NOT NULL,
    outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tuyu_core.administrator_assertion (
    assertion_hash bytea PRIMARY KEY,
    installation_id uuid NOT NULL REFERENCES tuyu_core.installation(id) ON DELETE CASCADE,
    local_session_id uuid NOT NULL,
    administrator_id uuid NOT NULL
        REFERENCES tuyu_core.local_system_administrator(id) ON DELETE CASCADE,
    administrator_public_key_fingerprint char(64) NOT NULL
        CHECK (administrator_public_key_fingerprint ~ '^[0-9a-f]{64}$'),
    local_session_expires_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (expires_at <= local_session_expires_at)
);

CREATE TABLE IF NOT EXISTS tuyu_core.upstream_administrator_session (
    upstream_session_id text PRIMARY KEY,
    assertion_hash bytea NOT NULL
        REFERENCES tuyu_core.administrator_assertion(assertion_hash) ON DELETE CASCADE,
    installation_id uuid NOT NULL REFERENCES tuyu_core.installation(id) ON DELETE CASCADE,
    administrator_id uuid NOT NULL,
    administrator_public_key_fingerprint char(64) NOT NULL
        CHECK (administrator_public_key_fingerprint ~ '^[0-9a-f]{64}$'),
    upstream_user text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tuyu_core.administrator_bridge_audit (
    audit_id bigserial PRIMARY KEY,
    assertion_hash bytea,
    upstream_session_id text,
    installation_id uuid REFERENCES tuyu_core.installation(id) ON DELETE SET NULL,
    administrator_id uuid,
    administrator_public_key_fingerprint char(64),
    action text NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED')),
    request_path text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS local_system_administrator_status_idx
    ON tuyu_core.local_system_administrator(installation_id, status);
CREATE INDEX IF NOT EXISTS administrator_audit_actor_idx
    ON tuyu_core.administrator_audit_log(installation_id, administrator_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS administrator_assertion_expiry_idx
    ON tuyu_core.administrator_assertion(expires_at)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS administrator_assertion_administrator_idx
    ON tuyu_core.administrator_assertion(installation_id, administrator_id);
CREATE INDEX IF NOT EXISTS upstream_administrator_session_expiry_idx
    ON tuyu_core.upstream_administrator_session(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS upstream_administrator_session_administrator_idx
    ON tuyu_core.upstream_administrator_session(installation_id, administrator_id);
CREATE INDEX IF NOT EXISTS administrator_bridge_audit_local_identity_idx
    ON tuyu_core.administrator_bridge_audit(installation_id, administrator_id, created_at DESC);

CREATE OR REPLACE FUNCTION tuyu_core.reject_administrator_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.installation_id <> OLD.installation_id OR NEW.public_key <> OLD.public_key THEN
        RAISE EXCEPTION 'administrator public key is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS local_system_administrator_identity_immutable
    ON tuyu_core.local_system_administrator;
CREATE TRIGGER local_system_administrator_identity_immutable
BEFORE UPDATE ON tuyu_core.local_system_administrator
FOR EACH ROW EXECUTE FUNCTION tuyu_core.reject_administrator_identity_change();

COMMIT;
