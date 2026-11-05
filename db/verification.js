const protectedTables = ['users','plots','activities','approvals','lots','reviews'];

export function captureProtectedState(db) {
  return Object.fromEntries(protectedTables.map(table => {
    const rows = db.prepare(`SELECT id FROM "${table}" ORDER BY id`).all().map(row => row.id);
    return [table, { count: rows.length, ids: rows }];
  }));
}

export function verifyDatabase(db, expectedState) {
  const integrity = db.pragma('integrity_check').map(row => row.integrity_check);
  const foreignKeyErrors = db.pragma('foreign_key_check');
  const actualState = captureProtectedState(db);
  const preserved = JSON.stringify(actualState) === JSON.stringify(expectedState);
  return { integrity, foreignKeyErrors, actualState, preserved };
}

