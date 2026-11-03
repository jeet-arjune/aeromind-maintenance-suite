-- AeroMind Database v1
-- All timestamps are stored in UTC.

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL
);

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    granted_by_user_id INTEGER REFERENCES users(id),
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE technician_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    employee_code TEXT NOT NULL UNIQUE,
    specialization TEXT NOT NULL,
    shift TEXT NOT NULL DEFAULT 'unassigned',
    availability TEXT NOT NULL DEFAULT 'available'
        CHECK (availability IN ('available','busy','on_leave','inactive')),
    hired_on TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE technician_certifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    certificate_name TEXT NOT NULL,
    certificate_number TEXT,
    issuing_authority TEXT,
    issued_on TEXT,
    expires_on TEXT,
    verified_by_user_id INTEGER REFERENCES users(id),
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_seen_at TEXT,
    ip_address TEXT,
    user_agent TEXT
);

CREATE TABLE engines (
    id INTEGER PRIMARY KEY,
    engine_code TEXT NOT NULL UNIQUE,
    data_origin TEXT NOT NULL DEFAULT 'simulated'
        CHECK (data_origin IN ('simulated','operational')),
    dataset_source TEXT,
    dataset_split TEXT CHECK (
        dataset_split IN ('train','test') OR dataset_split IS NULL
    ),
    dataset_unit_id INTEGER,
    health_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (health_status IN ('unknown','healthy','at_risk','critical')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dataset_source, dataset_split, dataset_unit_id)
);

CREATE TABLE model_versions (
    id INTEGER PRIMARY KEY,
    model_name TEXT NOT NULL,
    version TEXT NOT NULL,
    algorithm TEXT,
    training_dataset TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (model_name, version)
);

CREATE TABLE rul_predictions (
    id INTEGER PRIMARY KEY,
    engine_id INTEGER NOT NULL REFERENCES engines(id) ON DELETE RESTRICT,
    model_version_id INTEGER REFERENCES model_versions(id),
    predicted_rul_cycles REAL NOT NULL CHECK (predicted_rul_cycles >= 0),
    risk_level TEXT NOT NULL
        CHECK (risk_level IN ('healthy','at_risk','critical')),
    anomaly_score REAL,
    confidence_score REAL CHECK (
        confidence_score BETWEEN 0 AND 1 OR confidence_score IS NULL
    ),
    input_cycle INTEGER,
    metadata_json TEXT,
    predicted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_orders (
    id INTEGER PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    engine_id INTEGER NOT NULL REFERENCES engines(id) ON DELETE RESTRICT,
    prediction_id INTEGER REFERENCES rul_predictions(id),
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low','medium','high','critical')),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN (
            'open','assigned','in_progress','on_hold',
            'pending_review','completed','cancelled'
        )),
    assigned_to_user_id INTEGER REFERENCES users(id),
    created_by_user_id INTEGER NOT NULL REFERENCES users(id),
    verified_by_user_id INTEGER REFERENCES users(id),
    due_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE maintenance_logs (
    id INTEGER PRIMARY KEY,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id),
    technician_user_id INTEGER NOT NULL REFERENCES users(id),
    activity_type TEXT NOT NULL
        CHECK (activity_type IN (
            'inspection','repair','replacement','test','other'
        )),
    summary TEXT NOT NULL,
    details TEXT,
    labor_minutes INTEGER NOT NULL DEFAULT 0 CHECK (labor_minutes >= 0),
    performed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    correction_of_log_id INTEGER REFERENCES maintenance_logs(id)
);

CREATE TABLE work_order_events (
    id INTEGER PRIMARY KEY,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id),
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    event_type TEXT NOT NULL,
    old_value_json TEXT,
    new_value_json TEXT,
    note TEXT,
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    old_values_json TEXT,
    new_values_json TEXT,
    request_id TEXT,
    source TEXT NOT NULL DEFAULT 'api',
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    description TEXT,
    updated_by_user_id INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Query performance
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_certifications_user ON technician_certifications(user_id);
CREATE INDEX idx_sessions_user ON auth_sessions(user_id, expires_at);
CREATE INDEX idx_predictions_engine ON rul_predictions(engine_id, predicted_at);
CREATE INDEX idx_orders_engine ON work_orders(engine_id);
CREATE INDEX idx_orders_assignee ON work_orders(assigned_to_user_id, status);
CREATE INDEX idx_orders_status ON work_orders(status, priority);
CREATE INDEX idx_logs_order ON maintenance_logs(work_order_id);
CREATE INDEX idx_events_order ON work_order_events(work_order_id, occurred_at);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id, occurred_at);

-- Preserve historical records.
-- Corrections must be recorded as new entries.
CREATE TRIGGER protect_logs_update
BEFORE UPDATE ON maintenance_logs
BEGIN
    SELECT RAISE(ABORT, 'Maintenance logs are immutable');
END;

CREATE TRIGGER protect_logs_delete
BEFORE DELETE ON maintenance_logs
BEGIN
    SELECT RAISE(ABORT, 'Maintenance logs cannot be deleted');
END;

CREATE TRIGGER protect_events_update
BEFORE UPDATE ON work_order_events
BEGIN
    SELECT RAISE(ABORT, 'Work order events are immutable');
END;

CREATE TRIGGER protect_events_delete
BEFORE DELETE ON work_order_events
BEGIN
    SELECT RAISE(ABORT, 'Work order events cannot be deleted');
END;

CREATE TRIGGER protect_audit_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'Audit events are immutable');
END;

CREATE TRIGGER protect_audit_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'Audit events cannot be deleted');
END;

-- Roles only: no default users or passwords.
INSERT INTO roles (name, description) VALUES
('admin', 'Manage users, permissions, settings and work orders'),
('supervisor', 'Assign and verify maintenance work'),
('technician', 'Perform and record assigned maintenance'),
('viewer', 'Read authorized engine and maintenance information');

-- Safe initial application settings.
INSERT INTO app_settings (key, value_json, description) VALUES
('demo_mode', 'true', 'Use simulated demonstration workflows'),
('auto_create_work_orders', 'false', 'Require manual approval of new work orders');
