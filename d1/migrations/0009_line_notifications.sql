-- 0009_line_notifications.sql
-- LINE Messaging API push notification tracking and idempotency logs

CREATE TABLE IF NOT EXISTS line_notifications(
  id INTEGER PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'input_request_submitted',
    'approval_approved',
    'approval_rejected',
    'rhythm_overdue_14d',
    'capa_deadline'
  )),
  recipient_user_id INTEGER NOT NULL REFERENCES users(id),
  recipient_line_id TEXT NOT NULL,
  message_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','skipped')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_line_notifications_recipient ON line_notifications(recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_line_notifications_created ON line_notifications(created_at);
