CREATE TABLE IF NOT EXISTS photo_evidence(
  id INTEGER PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('activity','review')),
  entity_id INTEGER,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  sha256_hex TEXT NOT NULL,
  storage_backend TEXT NOT NULL DEFAULT 'r2' CHECK(storage_backend IN ('r2','local')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photo_evidence_plot ON photo_evidence(plot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_evidence_entity ON photo_evidence(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_photo_evidence_owner ON photo_evidence(owner_user_id);
