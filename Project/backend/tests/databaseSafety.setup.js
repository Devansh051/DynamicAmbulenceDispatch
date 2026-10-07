import '../src/config/env.js';

const sqlSuites = ['auth.test.js', 'googleAuth.test.js', 'rbac.test.js', 'phase3.test.js', 'phase4.test.js', 'phase4_regression_fixes.test.js', 'phase5_dispatch_engine.test.js', 'fleet_integration.test.js'];
const file = expect.getState().testPath?.replaceAll('\\', '/').split('/').pop();
if (sqlSuites.includes(file) && !/^[A-Za-z][A-Za-z0-9_]*_Test$/.test(process.env.DB_NAME || '')) {
  throw new Error('Database-writing tests require an isolated DB_NAME ending in _Test. Run scripts/setupTestDatabase.js and migrations first.');
}

// Dispatch treats unavailable Redis as an operational failure. SQL/API suites
// use a dedicated real Redis namespace instead of silently bypassing live state.
if (sqlSuites.includes(file) && file !== 'fleet_integration.test.js') {
  const { default: env } = await import('../src/config/env.js');
  const { default: store } = await import('../src/modules/fleet/fleetState.store.js');
  env.fleet.redisPrefix = 'ems:test:' + file + ':' + process.pid;
  beforeAll(async () => { if (!await store.init()) throw new Error('Real Redis required for SQL dispatch tests. Check REDIS_URL / sandbox access.'); });
  afterAll(async () => {
    if (store.isRedisReady()) {
      const keys = [];
      for await (const key of store.client.scanIterator({ MATCH: store.key('*') })) keys.push(key);
      if (keys.length) await store.client.unlink(keys);
    }
    await store.close();
  });
}
