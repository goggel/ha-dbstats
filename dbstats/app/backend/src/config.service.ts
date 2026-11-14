import { ConfigurationError, HaYaml } from './ha-yaml';
import * as fs from 'fs';
import * as path from 'path';
import type { DataSourceOptions } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import type { SqliteConnectionOptions } from 'typeorm/driver/sqlite/SqliteConnectionOptions';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';

type DBType = DataSourceOptions['type'];

export type ConfigData = {
  typeOrmConfig: Partial<DataSourceOptions>;
  db: {
    logging: boolean;
  };
  server: {
    port: number;
  };
  maxRowsInChart: number;
};

@Injectable()
export class ConfigService {
  public readonly data: ConfigData;
  private logger: Logger;
  constructor(
    haHomeDir?: string,
    sources?: { env: NodeJS.ProcessEnv; options: unknown },
  ) {
    this.logger = new Logger(ConfigService.name);
    const env = sources?.env ?? process.env;

    let haAddonOptions = sources?.options as { connectionString?: unknown };
    if (!sources) {
      try {
        haAddonOptions =
          fs.existsSync('/data/options.json') &&
          JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
      } catch {
        throw new ConfigurationError('CONFIG_OPTIONS_INVALID');
      }
    }
    const connection =
      haAddonOptions?.connectionString || env.DB_CONNECT_STRING;
    if (connection !== undefined && typeof connection !== 'string') {
      throw new ConfigurationError('CONFIG_URL_INVALID');
    }
    const typeOrmConfig = this.extractRecorderConfig(
      haHomeDir || env.HOME_DIR || '/homeassistant',
      typeof connection === 'string' ? connection : undefined,
    );
    this.data = {
      typeOrmConfig,
      db: {
        logging: env.DB_LOGGING === 'true',
      },
      server: {
        port: parseInt(env.SERVER_PORT, 10) || 3000,
      },
      maxRowsInChart: parseInt(env.MAX_ROWS_IN_CHART, 10) || 30,
    };
    Object.freeze(this.data);
    const errorMessages = [];
    Object.entries(this.data).forEach(([sectionName, section]) => {
      Object.entries(section).forEach(([settingName, value]) => {
        if (value === undefined) {
          errorMessages.push(`${sectionName}.${settingName} not provided`);
        }
      });
    });
    if (errorMessages.length) {
      this.logger.log(errorMessages.join('\n'));
      process.exit(1);
    }
  }

  static getDbTypeFromConnectionString(dbConnectString: string): DBType {
    /*Examples from https://www.home-assistant.io/integrations/recorder/:

SQLite
sqlite:////PATH/TO/DB_NAME

MariaDB (omit pymysql)
mysql://user:password@SERVER_IP/DB_NAME?charset=utf8mb4

MariaDB (omit pymysql, using TLS encryption)
mysql://user:password@SERVER_IP/DB_NAME?charset=utf8mb4;ssl=true

MariaDB (omit pymysql, Socket)
mysql://user:password@SERVER_IP/DB_NAME?unix_socket=/var/run/mysqld/mysqld.sock&charset=utf8mb4

MySQL
mysql://user:password@SERVER_IP/DB_NAME?charset=utf8mb4

MySQL (using TLS encryption)
mysql://user:password@SERVER_IP/DB_NAME?charset=utf8mb4;ssl=true

MySQL (Socket)
mysql://user:password@localhost/DB_NAME?unix_socket=/var/run/mysqld/mysqld.sock&charset=utf8mb4

MariaDB
mysql+pymysql://user:password@SERVER_IP/DB_NAME?charset=utf8mb4

MariaDB (Socket)
mysql+pymysql://user:password@localhost/DB_NAME?unix_socket=/var/run/mysqld/mysqld.sock&charset=utf8mb4

PostgreSQL
postgresql://user:password@SERVER_IP/DB_NAME

PostgreSQL (Socket)
postgresql://@/DB_NAME

PostgreSQL (Custom socket dir)
postgresql://@/DB_NAME?host=/path/to/dir
*/
    if (dbConnectString.startsWith('postgres')) {
      return 'postgres';
    }
    if (dbConnectString.startsWith('mysql')) {
      return 'mysql';
    }
    if (dbConnectString.startsWith('sqlite')) {
      return 'sqlite';
    }
    throw new ConfigurationError('CONFIG_URL_INVALID');
  }

  static connectionStringToDatabaseOptions(
    dbConnectString: string,
  ): Partial<DataSourceOptions> {
    if (
      !/^(postgres(?:ql)?|mysql(?:\+pymysql)?|sqlite):\/\/.+/.test(
        dbConnectString,
      )
    ) {
      throw new ConfigurationError('CONFIG_URL_INVALID');
    }
    const dbType = ConfigService.getDbTypeFromConnectionString(dbConnectString);
    const { env } = process;
    const queryTimeout = parseInt(env.DB_QUERY_TIMEOUT, 10) || 180_000;
    if (dbType === 'sqlite') {
      const database = dbConnectString.split('://')[1];
      const options: SqliteConnectionOptions = {
        type: 'sqlite',
        database: database,
        // https://www.sqlite.org/c3ref/c_open_autoproxy.html
        // #define SQLITE_OPEN_READONLY         0x00000001  /* Ok for sqlite3_open_v2() */
        flags: 0x00000001,
      };
      return options;
    }
    if (dbType === 'postgres') {
      const options: PostgresConnectionOptions = {
        type: 'postgres',
        url: `postgresql://${dbConnectString.split('://')[1]}`,
        extra: {
          query_timeout: queryTimeout,
          statement_timeout: queryTimeout, // three minutes for a query to complete
        },
      };
      return options;
    }
    if (dbType === 'mysql') {
      const options: MysqlConnectionOptions = {
        type: 'mysql',
        connectorPackage: 'mysql2',
        url: `mysql://${dbConnectString.split('://')[1]}`,
        extra: {
          options: `--max_execution_time=${queryTimeout}`,
        },
      };
      return options;
    }
    throw new Error(`Unknown database type ${dbType}`);
  }

  extractRecorderConfig(
    haHomeDir?: string,
    dbConnectString?: string,
  ): Partial<DataSourceOptions> {
    if (dbConnectString) {
      this.logger.log(`Using database options from env`);
      return ConfigService.connectionStringToDatabaseOptions(dbConnectString);
    }
    if (!haHomeDir) {
      throw new Error(
        `Neither home dir nor database connection string is provided!`,
      );
    }
    this.logger.log(`database options from env not found, checking config`);
    const configFileName = path.join(haHomeDir, '/configuration.yaml');
    if (!fs.existsSync(configFileName)) {
      throw new Error(`Config file not found in path ${haHomeDir}`);
    }
    this.logger.log(`config file found, parsing`);
    const url = new HaYaml(haHomeDir).recorder();
    if (url !== undefined) {
      return ConfigService.connectionStringToDatabaseOptions(url as string);
    }
    this.logger.log(
      `recorder options not found, gonna try standard database path`,
    );
    const sqliteFileName = path.join(haHomeDir, '/home-assistant_v2.db');
    if (!fs.existsSync(sqliteFileName)) {
      throw new Error(`SQLite database file not found in ${sqliteFileName}`);
    }
    this.logger.log(
      `Found standard sqlite file, gonna use it: ${sqliteFileName}`,
    );
    return ConfigService.connectionStringToDatabaseOptions(
      `sqlite://${sqliteFileName}`,
    );
  }
}
