export const migration002 = {
  version: 2,
  name: 'admin_password_credentials',
  up(db) {
    db.exec(`CREATE TABLE admin_password_credentials(
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      algorithm TEXT NOT NULL DEFAULT 'scrypt' CHECK(algorithm='scrypt'),
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  },
};

