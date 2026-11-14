const indexes = {
  states: {ix_states_metadata_id_last_updated_ts:['metadata_id','last_updated_ts'], ix_states_attributes_id:['attributes_id']},
  statistics: {ix_statistics_statistic_id_start_ts:['metadata_id','start_ts']},
  statistics_short_term: {ix_statistics_short_term_statistic_id_start_ts:['metadata_id','start_ts']},
  events: {ix_events_event_type_id_time_fired_ts:['event_type_id','time_fired_ts']},
  states_meta: {ix_states_meta_entity_id:['entity_id']},
  statistics_meta: {ix_statistics_meta_statistic_id:['statistic_id']},
};
async function create(query) {
  const tables = {
    states:'state_id INT PRIMARY KEY AUTO_INCREMENT, metadata_id INT NULL, attributes_id INT NULL, last_updated_ts DOUBLE',
    statistics:'id INT PRIMARY KEY AUTO_INCREMENT, metadata_id INT NULL, start_ts DOUBLE',
    statistics_short_term:'id INT PRIMARY KEY AUTO_INCREMENT, metadata_id INT NULL, start_ts DOUBLE',
    events:'event_id INT PRIMARY KEY AUTO_INCREMENT, event_type_id INT NULL, time_fired_ts DOUBLE',
    states_meta:'metadata_id INT PRIMARY KEY, entity_id VARCHAR(255) NULL',
    statistics_meta:'id INT PRIMARY KEY, statistic_id VARCHAR(255) NULL',
    event_types:'event_type_id INT PRIMARY KEY, event_type VARCHAR(255) NULL',
    state_attributes:'attributes_id INT PRIMARY KEY, shared_attrs LONGTEXT NULL',
    schema_changes:'schema_version INT',
  };
  for (const table of Object.keys(tables)) await query(`DROP TABLE IF EXISTS ${table}`);
  for (const [table, columns] of Object.entries(tables)) {
    const extra = Object.entries(indexes[table] || {}).map(([name, cols]) => `${['states_meta','statistics_meta','statistics','statistics_short_term'].includes(table) ? 'UNIQUE ' : ''}INDEX ${name} (${cols.join(',')})`);
    await query(`CREATE TABLE ${table} (${[columns,...extra].join(',')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  }
  await query('INSERT INTO schema_changes VALUES (53)');
}
async function seed(query) {
  for (const [table, pk, label] of [['states_meta','metadata_id','entity_id'],['statistics_meta','id','statistic_id'],['event_types','event_type_id','event_type']]) {
    await query(`INSERT INTO ${table} (${pk},${label}) VALUES (1,'sensor.a'),(2,'sensor.b'),(3,NULL),(4,NULL)`);
  }
  await query('INSERT INTO state_attributes VALUES (1,?),(2,?),(3,NULL)', ['😀'.repeat(4000),'a'.repeat(16000)]);
  const refs = [[1,1],[1,1],[2,1],[2,2],[3,1],[4,1],[null,1],[999,1],[1,null],[1,999],[1,3]];
  for (const [i,[id, attr]] of refs.entries()) {
    await query('INSERT INTO states(metadata_id,attributes_id,last_updated_ts) VALUES (?,?,?)',[id,attr,i]);
    for (const table of ['statistics','statistics_short_term']) await query(`INSERT INTO ${table}(metadata_id,start_ts) VALUES (?,?)`,[id,i]);
    await query('INSERT INTO events(event_type_id,time_fired_ts) VALUES (?,?)',[id,i]);
  }
}
module.exports = {indexes, create, seed};
