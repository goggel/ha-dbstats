/** Bounded output only; database scan cost is bounded by QueryGateway deadlines. */
export function domainQuery(engine: string, limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('Invalid domain result limit');
  }
  let domain: string;
  let key: string;
  switch (engine) {
    case 'sqlite':
      domain = `CASE WHEN json_valid(d.shared_data) THEN
        CASE WHEN json_type(d.shared_data, '$.domain') = 'text'
        THEN json_extract(d.shared_data, '$.domain') END END`;
      key = 'hex(domain)';
      break;
    case 'mysql':
    case 'mariadb':
      // Recorder payload bytes are UTF-8 even when the column has binary charset.
      // Reject lossy conversion before JSON parsing; never repair invalid JSON.
      domain = `CASE WHEN HEX(CONVERT(d.shared_data USING utf8mb4)) = HEX(d.shared_data)
        AND JSON_VALID(CONVERT(d.shared_data USING utf8mb4)) THEN
        CASE WHEN JSON_TYPE(JSON_EXTRACT(CONVERT(d.shared_data USING utf8mb4), '$.domain')) = 'STRING'
        THEN JSON_UNQUOTE(JSON_EXTRACT(CONVERT(d.shared_data USING utf8mb4), '$.domain')) END END`;
      key = 'HEX(domain)';
      break;
    case 'postgres':
      // pg_input_is_valid is available in PostgreSQL 16+. Never cast invalid text.
      domain = `CASE WHEN pg_input_is_valid(d.shared_data, 'jsonb') THEN
        CASE WHEN jsonb_typeof(d.shared_data::jsonb -> 'domain') = 'string'
        THEN d.shared_data::jsonb ->> 'domain' END END`;
      key = "encode(convert_to(domain, 'UTF8'), 'hex')";
      break;
    default:
      throw new Error('Unsupported domain query engine');
  }
  return `SELECT MIN(domain) AS type, SUM(ref_count) AS cnt
    FROM (SELECT ${domain} AS domain, refs.ref_count
      FROM (SELECT data_id, COUNT(*) AS ref_count FROM events
        WHERE data_id IS NOT NULL GROUP BY data_id) refs
      INNER JOIN event_data d ON d.data_id = refs.data_id) domains
    WHERE domain IS NOT NULL AND ${
      engine === 'postgres'
        ? 'octet_length(domain)'
        : engine === 'sqlite'
          ? 'length(CAST(domain AS BLOB))'
          : 'OCTET_LENGTH(domain)'
    } > 0
    GROUP BY ${key}
    ORDER BY cnt DESC, ${key} ASC LIMIT ${limit}`;
}
