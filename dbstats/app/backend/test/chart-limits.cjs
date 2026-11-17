// Actual SQLite SQL, >20 groups and tables, isolated in-memory fixture.
const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const { ConfigService } = require('../dist/backend/src/config.service');
const config = new ConfigService(undefined, {
  env: {
    DB_CONNECT_STRING: 'sqlite://:memory:',
    MAX_ROWS_IN_CHART: process.argv[2],
  },
  options: {},
}).data;
require.cache[require.resolve('../dist/backend/src/config')] = {
  exports: { default: () => config },
};
const entity = (n) =>
  require(`../dist/backend/src/entities/homeass/2024.1.5/${n}`)[n];
(async () => {
  const ds = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [
      'States',
      'StatesMeta',
      'StateAttributes',
      'Statistics',
      'StatisticsShortTerm',
      'StatisticsMeta',
      'Events',
      'EventTypes',
      'EventData',
    ].map(entity),
  });
  await ds.initialize();
  try {
    const q = (sql, p) => ds.query(sql, p);
    const schema = {
      states: 'metadata_id INT, attributes_id INT',
      states_meta: 'metadata_id INT, entity_id TEXT',
      state_attributes: 'attributes_id INT, shared_attrs TEXT',
      statistics: 'metadata_id INT',
      statistics_short_term: 'metadata_id INT',
      statistics_meta: 'id INT, statistic_id TEXT',
      events: 'event_type_id INT, data_id INT',
      event_types: 'event_type_id INT, event_type TEXT',
      event_data: 'data_id INT, shared_data TEXT',
    };
    for (const [t, c] of Object.entries(schema))
      await q(`CREATE TABLE ${t} (${c})`);
    for (let i = 1; i <= 35; i++) {
      for (const t of ['states_meta', 'statistics_meta', 'event_types'])
        await q(`INSERT INTO ${t} VALUES (?,?)`, [i, `sensor.${i}`]);
      await q('INSERT INTO state_attributes VALUES (?,?)', [
        i,
        'x'.repeat(12000 + i),
      ]);
      await q('INSERT INTO event_data VALUES (?,?)', [
        i,
        JSON.stringify({ domain: `domain.${i}` }),
      ]);
      for (let j = 0; j < i; j++)
        for (const sql of [
          `INSERT INTO states VALUES (${i},${i})`,
          `INSERT INTO statistics VALUES (${i})`,
          `INSERT INTO statistics_short_term VALUES (${i})`,
          `INSERT INTO events VALUES (${i},${i})`,
        ])
          await q(sql);
      await q(`CREATE TABLE extra_${i} (id INT)`);
    }
    const { QueryGateway } = require('../dist/backend/src/query-gateway');
    const g = new QueryGateway(ds, {
      executionMs: 3000,
      acquisitionMs: 3000,
      queueMs: 3000,
      concurrency: 1,
      maxPending: 8,
    });
    const repo = (n) => ds.getRepository(entity(n));
    const state =
      new (require('../dist/backend/src/state/state.service').StateService)(
        g,
        repo('States'),
        repo('StateAttributes'),
      );
    const stats =
      new (require('../dist/backend/src/statistic/statistic.service').StatisticService)(
        g,
        repo('StatisticsShortTerm'),
        repo('Statistics'),
      );
    const events =
      new (require('../dist/backend/src/event/event.service').EventService)(
        g,
        repo('Events'),
        repo('EventData'),
      );
    const system =
      new (require('../dist/backend/src/system/system.service').SystemService)(
        g,
        repo('Statistics'),
      );
    for (const run of [
      () => state.countStateTypes(),
      () => state.countAttributesSize(),
      () => stats.countStatsLong(),
      () => stats.countStatsShort(),
      () => events.countEventTypes(),
      () => events.countEventsByDomain(),
      () => system.getTableRows(),
      () => system.getTableSize(),
    ]) {
      const rows = await g.runOperation(run);
      assert.equal(rows.length, config.maxRowsInChart);
      for (let i = 1; i < rows.length; i++)
        assert(Number(rows[i - 1].cnt) >= Number(rows[i].cnt));
    }
    console.log(`All eight charts obey limit ${config.maxRowsInChart}`);
  } finally {
    await ds.destroy();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
