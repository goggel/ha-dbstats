import * as fs from 'fs';
import * as path from 'path';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import { ConfigurationError } from './ha-yaml';

/** Parse only supported HA transport options; never pass arbitrary URI options on. */
export function mysqlTransport(uri: string): MysqlConnectionOptions {
  try {
    const url = new URL(uri.replace(/^mysql\+pymysql:/, 'mysql:'));
    if (url.hash) {
      throw new Error();
    }
    // Legacy HA examples used semicolons. Split before decoding so %3B stays data.
    const params = new URLSearchParams(url.search.slice(1).replace(/;/g, '&'));
    const allowed = new Set([
      'charset',
      'ssl',
      'ssl_mode',
      'ssl_ca',
      'unix_socket',
    ]);
    const values = new Map<string, string>();
    for (const [key, value] of params) {
      if (!allowed.has(key) || values.has(key) || !value) {
        throw new Error();
      }
      values.set(key, value);
    }
    const charset = values.get('charset') ?? 'utf8mb4';
    if (!/^[a-zA-Z0-9_]+$/.test(charset)) {
      throw new Error();
    }
    const ssl = values.get('ssl');
    const mode = values.get('ssl_mode');
    if (ssl && ssl !== 'true') {
      throw new Error();
    }
    if (mode && !['REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY'].includes(mode)) {
      throw new Error();
    }
    const ca = values.get('ssl_ca');
    const socketPath = values.get('unix_socket');
    if (
      socketPath &&
      (!path.isAbsolute(socketPath) || !fs.statSync(socketPath).isSocket())
    ) {
      throw new Error();
    }
    if (socketPath && (ssl || mode || ca)) {
      throw new Error();
    }
    if (ca && (!path.isAbsolute(ca) || !fs.statSync(ca).isFile())) {
      throw new Error();
    }
    url.search = '';
    return {
      type: 'mysql',
      connectorPackage: 'mysql2',
      url: url.toString(),
      charset,
      ...(socketPath ? { socketPath } : {}),
      ...(ssl || mode || ca
        ? {
            ssl: {
              rejectUnauthorized: true,
              verifyIdentity: true,
              ...(ca ? { ca: fs.readFileSync(ca, 'utf8') } : {}),
            },
          }
        : {}),
    };
  } catch {
    throw new ConfigurationError('CONFIG_MYSQL_TRANSPORT_INVALID');
  }
}
