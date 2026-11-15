/** Only protocol identifiers may cross the driver logging boundary. */
export function databaseErrorDiagnostics(error: unknown): string {
  const codes = new Set([
    'ER_WRONG_FIELD_WITH_GROUP',
    'ER_NON_GROUPING_FIELD_USED',
    'ER_INVALID_JSON_TEXT',
    'ER_INVALID_JSON_CHARSET',
    'ER_CANT_AGGREGATE_2COLLATIONS',
    'ER_CANT_AGGREGATE_3COLLATIONS',
    'ER_CANT_AGGREGATE_NCOLLATIONS',
    'ER_BAD_FIELD_ERROR',
    'ER_NO_SUCH_TABLE',
    'ER_TABLEACCESS_DENIED_ERROR',
    'ER_ACCESS_DENIED_ERROR',
    'ER_PARSE_ERROR',
    'ER_QUERY_TIMEOUT',
    'ER_STATEMENT_TIMEOUT',
    'ER_QUERY_INTERRUPTED',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'PROTOCOL_CONNECTION_LOST',
    'SQLITE_ERROR',
    'SQLITE_BUSY',
    'SQLITE_INTERRUPT',
    'SQLITE_READONLY',
  ]);
  if (!error || typeof error !== 'object') {
    return '';
  }
  const outer = error as Record<string, unknown>;
  const driver =
    outer.driverError && typeof outer.driverError === 'object'
      ? (outer.driverError as Record<string, unknown>)
      : outer;
  const fields: string[] = [];
  if (
    typeof driver.code === 'string' &&
    (codes.has(driver.code) || /^[0-9]{5}$/.test(driver.code))
  ) {
    fields.push(`code=${driver.code}`);
  }
  if (
    typeof driver.errno === 'number' &&
    Number.isInteger(driver.errno) &&
    driver.errno >= 0 &&
    driver.errno <= 65535
  ) {
    fields.push(`errno=${driver.errno}`);
  }
  if (
    typeof driver.sqlState === 'string' &&
    /^[0-9A-Z]{5}$/.test(driver.sqlState)
  ) {
    fields.push(`sqlState=${driver.sqlState}`);
  }
  return fields.length ? `; ${fields.join(' ')}` : '';
}
