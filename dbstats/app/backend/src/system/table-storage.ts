import { BadRequestException } from '@nestjs/common';
import type { ITableStorage } from '@dbstats/shared/src/stats';
import type { QueryGateway } from '../query-gateway';

export async function tableStorage(
  gateway: QueryGateway,
  type: string,
): Promise<ITableStorage[]> {
  let sql: string;
  if (type === 'mysql' || type === 'mariadb') {
    sql = `SELECT TABLE_SCHEMA schema_name, TABLE_NAME name, DATA_LENGTH data_bytes,
      INDEX_LENGTH index_bytes, TABLE_ROWS estimated_rows FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'`;
  } else if (type === 'postgres') {
    sql = `SELECT n.nspname schema_name, c.relname name, pg_table_size(c.oid) data_bytes,
      pg_indexes_size(c.oid) index_bytes, CASE WHEN c.reltuples<0 THEN NULL ELSE c.reltuples END estimated_rows
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'`;
  } else if (type === 'sqlite') {
    const modules = await gateway.query<Array<{ name: string }>>(
      "SELECT name FROM pragma_module_list WHERE name='dbstat'",
    );
    sql = modules.length
      ? `WITH sizes AS (SELECT name,SUM(pgsize) bytes FROM dbstat GROUP BY name)
      SELECT 'main' schema_name,t.name,COALESCE(s.bytes,0) data_bytes,
      COALESCE((SELECT SUM(z.bytes) FROM sqlite_master i JOIN sizes z ON z.name=i.name
        WHERE i.type='index' AND i.tbl_name=t.name),0) index_bytes,NULL estimated_rows
      FROM sqlite_master t LEFT JOIN sizes s ON s.name=t.name
      WHERE t.type='table' AND substr(t.name,1,7)<>'sqlite_'`
      : `SELECT 'main' schema_name,name,NULL data_bytes,NULL index_bytes,NULL estimated_rows
         FROM sqlite_master WHERE type='table' AND substr(name,1,7)<>'sqlite_'`;
  } else {
    throw new BadRequestException(
      'Table storage is unavailable for this database type',
    );
  }
  const rows = await gateway.query<
    Array<{
      schema_name: string;
      name: string;
      data_bytes: string | number | null;
      index_bytes: string | number | null;
      estimated_rows: string | number | null;
    }>
  >(sql);
  const numeric = (value: string | number | null) =>
    value === null ? null : Number(value);
  return rows
    .map((row) => {
      const dataBytes = numeric(row.data_bytes),
        indexBytes = numeric(row.index_bytes);
      return {
        schema: row.schema_name,
        name: row.name,
        dataBytes,
        indexBytes,
        totalBytes:
          dataBytes === null || indexBytes === null
            ? null
            : dataBytes + indexBytes,
        estimatedRows: numeric(row.estimated_rows),
      };
    })
    .sort(
      (a, b) =>
        (b.totalBytes ?? -1) - (a.totalBytes ?? -1) ||
        a.schema.localeCompare(b.schema) ||
        a.name.localeCompare(b.name),
    );
}
