-- Skyboom attendance schema (idempotent). All timestamps are TIMESTAMPTZ (stored as UTC).
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  staff_no VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  department VARCHAR(80),
  role VARCHAR(10) NOT NULL CHECK (role IN ('admin','staff')),
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS work_schedules (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  working_days SMALLINT[] NOT NULL,            -- ISO: 1=Mon ... 7=Sun
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INT NOT NULL DEFAULT 15 CHECK (grace_minutes >= 0),
  absence_deadline TIME NOT NULL,
  early_departure_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE NOT NULL UNIQUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CHECK (absence_deadline > start_time),
  CHECK (cardinality(working_days) BETWEEN 1 AND 7)
);

CREATE TABLE IF NOT EXISTS office_locations (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_m INT NOT NULL CHECK (radius_m BETWEEN 10 AND 5000),
  max_accuracy_m INT NOT NULL DEFAULT 50 CHECK (max_accuracy_m BETWEEN 5 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_office ON office_locations (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  work_date DATE NOT NULL,                      -- Africa/Accra calendar date
  check_in_at TIMESTAMPTZ NOT NULL,
  check_out_at TIMESTAMPTZ,
  status VARCHAR(10) NOT NULL CHECK (status IN ('on_time','late')),
  source VARCHAR(12) NOT NULL DEFAULT 'self' CHECK (source IN ('self','exception','correction')),
  -- schedule snapshot so later schedule edits never rewrite history
  schedule_id BIGINT REFERENCES work_schedules(id),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INT NOT NULL,
  early_departure_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- location verification results (no location history kept)
  check_in_distance_m DOUBLE PRECISION,
  check_in_accuracy_m DOUBLE PRECISION,
  check_in_location_result VARCHAR(30),
  check_out_distance_m DOUBLE PRECISION,
  check_out_accuracy_m DOUBLE PRECISION,
  check_out_location_result VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date),
  CHECK (check_out_at IS NULL OR check_out_at > check_in_at)
);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (work_date);

CREATE TABLE IF NOT EXISTS attendance_exceptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  work_date DATE NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('check_in','check_out')),
  reason TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  attendance_id BIGINT REFERENCES attendance(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_exception
  ON attendance_exceptions (user_id, work_date, type) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40),
  entity_id VARCHAR(40),
  reason TEXT,
  before_value JSONB,
  after_value JSONB,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at DESC);

-- Audit logs are append-only.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Session store (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
