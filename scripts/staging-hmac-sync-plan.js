export const STAGING_TARGET = Object.freeze({
  workerName: 'ready-to-grow-staging',
  databaseName: 'ready-to-grow-staging',
  databaseId: 'cd385968-8137-4fdf-adc0-58a963b53ce4',
});

export function assertSynchronizationTarget(config, database) {
  if (config.name !== STAGING_TARGET.workerName ||
      database.database_name !== STAGING_TARGET.databaseName ||
      database.database_id !== STAGING_TARGET.databaseId ||
      config.vars?.ENVIRONMENT !== 'staging') {
    throw new Error('Synchronization target does not match the approved staging Worker and D1');
  }
}

export function synchronizationCommands({ wrangler, configFile, secretsFile, seedFile, tag }) {
  const common = ['--config', configFile];
  return {
    precheck: [wrangler, 'd1', 'execute', STAGING_TARGET.databaseName, '--remote', ...common,
      '--command', 'SELECT id,name FROM d1_migrations ORDER BY id; SELECT COUNT(*) AS users_count FROM users; SELECT COUNT(*) AS assignments_count FROM farmer_assignments;', '--json'],
    bookmark: [wrangler, 'd1', 'time-travel', 'info', STAGING_TARGET.databaseName, ...common, '--json'],
    upload: [wrangler, 'versions', 'upload', ...common, '--strict', '--tag', tag,
      '--message', 'Approved staging HMAC synchronization candidate', '--secrets-file', secretsFile],
    listVersions: [wrangler, 'versions', 'list', '--name', STAGING_TARGET.workerName, '--json'],
    deploy: [wrangler, 'versions', 'deploy', ...common, '--name', STAGING_TARGET.workerName,
      '--version-tag', `${tag}@100%`, '--message', 'Approved staging HMAC synchronization', '--yes'],
    seed: [wrangler, 'd1', 'execute', STAGING_TARGET.databaseName, '--remote', ...common, '--file', seedFile, '--yes'],
    verify: [wrangler, 'd1', 'execute', STAGING_TARGET.databaseName, '--remote', ...common,
      '--command', "SELECT role,status,COUNT(*) AS count FROM users GROUP BY role,status ORDER BY role; SELECT COUNT(*) AS assignments_count FROM farmer_assignments WHERE ends_at IS NULL; SELECT COUNT(*) AS linked_count FROM users WHERE line_id IS NOT NULL OR linked_at IS NOT NULL; SELECT COUNT(*) AS password_count FROM admin_password_credentials; SELECT COUNT(*) AS credential_count FROM agency_credentials; PRAGMA foreign_key_check;", '--json'],
  };
}

export function validateEmptyPrecheck(results) {
  const migrations = results?.[0]?.results ?? [];
  const users = results?.[1]?.results?.[0]?.users_count;
  const assignments = results?.[2]?.results?.[0]?.assignments_count;
  if (migrations.length !== 5 || migrations.some((row, index) => row.id !== index + 1)) {
    throw new Error('Remote migration history is not exactly 0001-0005');
  }
  if (users !== 0 || assignments !== 0) throw new Error('Remote staging identity tables are not empty');
}
