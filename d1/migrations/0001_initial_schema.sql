CREATE TABLE users(
  id INTEGER PRIMARY KEY,
  line_id TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'farmer' CHECK(role IN ('farmer','ics','admin')),
  status TEXT NOT NULL DEFAULT 'unlinked' CHECK(status IN ('unlinked','active','disabled')),
  linked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((line_id IS NULL AND linked_at IS NULL) OR line_id IS NOT NULL)
);

CREATE TABLE plots(
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  crop TEXT NOT NULL,
  area TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activities(
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  details TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  photo_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approvals(
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  input_name TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewer_id INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lots(
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  code TEXT NOT NULL UNIQUE,
  crop TEXT NOT NULL,
  harvest_date TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews(
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  result TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE agency_credentials(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_version TEXT NOT NULL,
  code_digest TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE farmer_assignments(
  id INTEGER PRIMARY KEY,
  ics_user_id INTEGER NOT NULL REFERENCES users(id),
  farmer_user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ics_user_id <> farmer_user_id),
  CHECK(ends_at IS NULL OR ends_at >= starts_at)
);

CREATE UNIQUE INDEX farmer_assignments_one_active_farmer
  ON farmer_assignments(farmer_user_id) WHERE ends_at IS NULL;
CREATE INDEX farmer_assignments_active_ics
  ON farmer_assignments(ics_user_id,farmer_user_id) WHERE ends_at IS NULL;

CREATE TRIGGER farmer_assignments_validate_insert
BEFORE INSERT ON farmer_assignments
BEGIN
  SELECT (CASE WHEN (SELECT role FROM users WHERE id=NEW.ics_user_id) <> 'ics'
    THEN RAISE(ABORT,'assignment requires an ICS officer') END);
  SELECT (CASE WHEN (SELECT role FROM users WHERE id=NEW.farmer_user_id) <> 'farmer'
    THEN RAISE(ABORT,'assignment requires a farmer') END);
  SELECT (CASE WHEN (SELECT role FROM users WHERE id=NEW.assigned_by) <> 'admin'
    THEN RAISE(ABORT,'assignment requires an admin actor') END);
END;

CREATE TRIGGER farmer_assignments_validate_update
BEFORE UPDATE OF ics_user_id,farmer_user_id,assigned_by,ends_at ON farmer_assignments
BEGIN
  SELECT (CASE WHEN (SELECT role FROM users WHERE id=NEW.ics_user_id) <> 'ics'
    THEN RAISE(ABORT,'assignment requires an ICS officer') END);
  SELECT (CASE WHEN (SELECT role FROM users WHERE id=NEW.farmer_user_id) <> 'farmer'
    THEN RAISE(ABORT,'assignment requires a farmer') END);
  SELECT (CASE WHEN (SELECT role FROM users WHERE id=NEW.assigned_by) <> 'admin'
    THEN RAISE(ABORT,'assignment requires an admin actor') END);
END;

CREATE TABLE registration_invites(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_line_id TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(used_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX registration_invites_user ON registration_invites(user_id,expires_at);

CREATE TABLE registration_requests(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified_line_id TEXT NOT NULL,
  verified_line_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired')),
  reviewed_by INTEGER REFERENCES users(id),
  review_note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX registration_requests_pending_user
  ON registration_requests(user_id) WHERE status='pending';
CREATE UNIQUE INDEX registration_requests_pending_line
  ON registration_requests(verified_line_id) WHERE status='pending';

CREATE TABLE audit_logs(
  id INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  request_id TEXT,
  source_ip_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_logs_event_time ON audit_logs(event_type,created_at);
CREATE INDEX audit_logs_actor_time ON audit_logs(actor_user_id,created_at);
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  BEGIN SELECT RAISE(ABORT,'audit logs are append-only'); END;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  BEGIN SELECT RAISE(ABORT,'audit logs are append-only'); END;

CREATE TABLE admin_password_credentials(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  algorithm TEXT NOT NULL DEFAULT 'scrypt' CHECK(algorithm='scrypt'),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
