DROP TRIGGER admin_identity_operations_apply;

CREATE TRIGGER admin_identity_operations_apply AFTER INSERT ON admin_identity_operations
BEGIN
  INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
  SELECT NULL,
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
