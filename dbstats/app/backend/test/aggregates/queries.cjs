// Investigation-only SQL. Production services deliberately remain unchanged.
const specs = {
  states: ['states', 'states_meta', 'metadata_id', 'metadata_id', 'entity_id'],
  statistics: ['statistics', 'statistics_meta', 'metadata_id', 'id', 'statistic_id'],
  statistics_short_term: ['statistics_short_term', 'statistics_meta', 'metadata_id', 'id', 'statistic_id'],
  events: ['events', 'event_types', 'event_type_id', 'event_type_id', 'event_type'],
};
function queries(name, limit = 30) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw Error('Invalid chart limit');
  if (name === 'attributes') return {
    baseline: `SELECT p.entity_id type, SUM(LENGTH(a.shared_attrs))/1024.0/1024.0 cnt FROM (SELECT DISTINCT a.attributes_id, m.entity_id FROM state_attributes a, states s, states_meta m WHERE a.attributes_id=s.attributes_id AND m.metadata_id=s.metadata_id) p, state_attributes a WHERE a.attributes_id=p.attributes_id GROUP BY p.entity_id ORDER BY cnt DESC LIMIT ${limit}`,
    candidate: `SELECT p.entity_id type, SUM(LENGTH(a.shared_attrs))/1024.0/1024.0 cnt FROM (SELECT DISTINCT c.attributes_id, m.entity_id FROM (SELECT DISTINCT metadata_id, attributes_id FROM states) c JOIN states_meta m ON m.metadata_id=c.metadata_id) p JOIN state_attributes a ON a.attributes_id=p.attributes_id GROUP BY p.entity_id ORDER BY cnt DESC LIMIT ${limit}`,
  };
  if (!Object.hasOwn(specs, name)) throw Error('Unknown aggregate');
  const [fact, meta, fk, pk, label] = specs[name];
  return {
    baseline: `SELECT m.${label} type, COUNT(*) cnt FROM ${fact} f JOIN ${meta} m ON f.${fk}=m.${pk} GROUP BY m.${label} ORDER BY cnt DESC LIMIT ${limit}`,
    candidate: `SELECT m.${label} type, SUM(c.cnt) cnt FROM (SELECT ${fk}, COUNT(*) cnt FROM ${fact} GROUP BY ${fk}) c JOIN ${meta} m ON c.${fk}=m.${pk} GROUP BY m.${label} ORDER BY cnt DESC LIMIT ${limit}`,
  };
}
function normalize(rows) {
  return rows.map(({type, cnt}) => ({type, cnt: String(cnt)})).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
module.exports = {queries, normalize, names: [...Object.keys(specs), 'attributes']};
