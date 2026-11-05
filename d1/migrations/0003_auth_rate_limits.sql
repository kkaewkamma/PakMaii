CREATE TABLE auth_rate_limits(
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(scope,key_hash,window_start)
);

CREATE INDEX auth_rate_limits_updated_at ON auth_rate_limits(updated_at);
