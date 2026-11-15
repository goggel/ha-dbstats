-- Use an existing secured client connected to the intended recorder database.
-- Metadata and estimated plans only. No ANALYZE/EXPLAIN ANALYZE, DDL or aggregates executed.
SELECT VERSION() AS version, @@version_comment AS product;
SELECT MAX(schema_version) AS schema_version FROM schema_changes;
SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('states','states_meta','state_attributes','events','event_types','event_data','statistics','statistics_short_term','statistics_meta');
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('states','states_meta','state_attributes','events','event_types','event_data','statistics','statistics_short_term','statistics_meta')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- states
EXPLAIN FORMAT=JSON SELECT m.entity_id type, COUNT(*) cnt FROM states f JOIN states_meta m ON f.metadata_id=m.metadata_id GROUP BY m.entity_id ORDER BY cnt DESC LIMIT 20;

-- statistics
EXPLAIN FORMAT=JSON SELECT m.statistic_id type, COUNT(*) cnt FROM statistics f JOIN statistics_meta m ON f.metadata_id=m.id GROUP BY m.statistic_id ORDER BY cnt DESC LIMIT 20;

-- statistics_short_term
EXPLAIN FORMAT=JSON SELECT m.statistic_id type, COUNT(*) cnt FROM statistics_short_term f JOIN statistics_meta m ON f.metadata_id=m.id GROUP BY m.statistic_id ORDER BY cnt DESC LIMIT 20;

-- events
EXPLAIN FORMAT=JSON SELECT m.event_type type, COUNT(*) cnt FROM events f JOIN event_types m ON f.event_type_id=m.event_type_id GROUP BY m.event_type ORDER BY cnt DESC LIMIT 20;

-- attributes
EXPLAIN FORMAT=JSON SELECT p.entity_id type, SUM(LENGTH(a.shared_attrs))/1024.0/1024.0 cnt FROM (SELECT DISTINCT a.attributes_id, m.entity_id FROM state_attributes a, states s, states_meta m WHERE a.attributes_id=s.attributes_id AND m.metadata_id=s.metadata_id) p, state_attributes a WHERE a.attributes_id=p.attributes_id GROUP BY p.entity_id ORDER BY cnt DESC LIMIT 20;

-- event domain
EXPLAIN FORMAT=JSON SELECT MIN(domain) AS type, SUM(ref_count) AS cnt
    FROM (SELECT CASE WHEN HEX(CONVERT(d.shared_data USING utf8mb4)) = HEX(d.shared_data)
        AND JSON_VALID(CONVERT(d.shared_data USING utf8mb4)) THEN
        CASE WHEN JSON_TYPE(JSON_EXTRACT(CONVERT(d.shared_data USING utf8mb4), '$.domain')) = 'STRING'
        THEN JSON_UNQUOTE(JSON_EXTRACT(CONVERT(d.shared_data USING utf8mb4), '$.domain')) END END AS domain, refs.ref_count
      FROM (SELECT data_id, COUNT(*) AS ref_count FROM events
        WHERE data_id IS NOT NULL GROUP BY data_id) refs
      INNER JOIN event_data d ON d.data_id = refs.data_id) domains
    WHERE domain IS NOT NULL AND OCTET_LENGTH(domain) > 0
    GROUP BY HEX(domain)
    ORDER BY cnt DESC, HEX(domain) ASC LIMIT 20;

EXPLAIN FORMAT=JSON SELECT table_name type, TABLE_ROWS cnt FROM INFORMATION_SCHEMA.TABLES WHERE table_schema = DATABASE() ORDER BY TABLE_ROWS DESC LIMIT 20;
EXPLAIN FORMAT=JSON SELECT table_name type, round((data_length+index_length)/1024/1024,2) cnt FROM INFORMATION_SCHEMA.TABLES WHERE table_schema = DATABASE() ORDER BY (data_length+index_length) DESC LIMIT 20;
