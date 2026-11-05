CREATE TABLE admin_identity_operations(
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL CHECK(action IN ('link','recover','unlink')),
  target_user_id INTEGER NOT NULL REFERENCES users(id),
  requested_line_id TEXT,
  operator_ref TEXT NOT NULL CHECK(length(operator_ref) BETWEEN 3 AND 100),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((action='unlink' AND requested_line_id IS NULL) OR (action IN ('link','recover') AND requested_line_id IS NOT NULL))
);

CREATE INDEX admin_identity_operations_target_time
  ON admin_identity_operations(target_user_id,created_at);

CREATE TRIGGER admin_identity_operations_validate BEFORE INSERT ON admin_identity_operations
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM users WHERE id=NEW.target_user_id AND role='admin'
      AND ((NEW.action='link' AND status IN ('unlinked','active') AND line_id IS NULL)
        OR (NEW.action='recover' AND status='active' AND line_id IS NOT NULL AND line_id<>NEW.requested_line_id)
        OR (NEW.action='unlink' AND status='active' AND line_id IS NOT NULL))
  ) THEN RAISE(ABORT,'admin identity operation is not allowed') END);
  SELECT (CASE WHEN NEW.requested_line_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM users WHERE line_id=NEW.requested_line_id AND id<>NEW.target_user_id
  ) THEN RAISE(ABORT,'LINE identity is already linked') END);
END;

CREATE TRIGGER admin_identity_operations_apply AFTER INSERT ON admin_identity_operations
BEGIN
  INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
  SELECT NEW.target_user_id,
    CASE NEW.action WHEN 'link' THEN 'admin.line_linked' WHEN 'recover' THEN 'admin.line_recovered' ELSE 'admin.line_unlinked' END,
    'user',CAST(NEW.target_user_id AS TEXT),
    json_object('operationId',NEW.id,'operatorRef',NEW.operator_ref,'reason',NEW.reason,
      'previousLineSuffix',COALESCE(substr(line_id,-6),''),
      'newLineSuffix',COALESCE(substr(NEW.requested_line_id,-6),''))
  FROM users WHERE id=NEW.target_user_id;
  UPDATE users SET line_id=NEW.requested_line_id,
    status=CASE WHEN NEW.action='link' THEN 'active' ELSE status END,
    linked_at=CASE WHEN NEW.action='unlink' THEN NULL ELSE CURRENT_TIMESTAMP END,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=NEW.target_user_id;
  DELETE FROM sessions WHERE user_id=NEW.target_user_id;
END;

CREATE TRIGGER admin_identity_operations_no_update BEFORE UPDATE ON admin_identity_operations
  BEGIN SELECT RAISE(ABORT,'admin identity operations are append-only'); END;
CREATE TRIGGER admin_identity_operations_no_delete BEFORE DELETE ON admin_identity_operations
  BEGIN SELECT RAISE(ABORT,'admin identity operations are append-only'); END;
