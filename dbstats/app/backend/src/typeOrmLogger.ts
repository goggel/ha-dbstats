import type { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import type { LoggerOptions as TypeOrmLoggerOptions } from 'typeorm/logger/LoggerOptions';
import { Logger } from '@nestjs/common';

/**
 * https://github.com/nestjs/nest/issues/3657
 * Effectively ripped out from:
 * https://github.com/typeorm/typeorm/blob/master/src/logger/SimpleConsoleLogger.ts
 */
export class TypeOrmLoggerContainer implements TypeOrmLogger {
  static ForConnection(connectionName: string, options: TypeOrmLoggerOptions) {
    const logger = new Logger(`TypeORM[${connectionName}]`);
    return new TypeOrmLoggerContainer(logger, options);
  }

  constructor(
    private readonly _logger: Logger,
    private readonly _options: TypeOrmLoggerOptions,
  ) {}

  /**
   * Logs query and parameters used in it.
   */
  // Keep TypeORM call signatures; SQL, parameters and runner context stay private.
  logQuery(query: string, parameters?: unknown[], queryRunner?: QueryRunner) {
    void query;
    void parameters;
    void queryRunner;
    if (
      this._options === 'all' ||
      this._options === true ||
      (this._options instanceof Array && this._options.indexOf('query') !== -1)
    ) {
      this._logger.log('Database query executed');
    }
  }

  /**
   * Logs query that is failed.
   */
  logQueryError(
    error: string,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ) {
    void error;
    void query;
    void parameters;
    void queryRunner;
    if (
      this._options === 'all' ||
      this._options === true ||
      (this._options instanceof Array && this._options.indexOf('error') !== -1)
    ) {
      this._logger.warn('Database query failed');
    }
  }

  /**
   * Logs query that is slow.
   */
  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ) {
    void query;
    void parameters;
    void queryRunner;
    this._logger.log(`Database query slow; execution time: ${time}ms`);
  }

  /**
   * Logs events from the schema build process.
   */
  logSchemaBuild(message: string, queryRunner?: QueryRunner) {
    void queryRunner;
    if (
      this._options === 'all' ||
      (this._options instanceof Array && this._options.indexOf('schema') !== -1)
    ) {
      this._logger.log(message);
    }
  }

  /**
   * Logs events from the migrations run process.
   */
  logMigration(message: string, queryRunner?: QueryRunner) {
    void queryRunner;
    this._logger.log(message);
  }

  /**
   * Perform logging using given logger, or by default to the this._logger.
   * Log has its own level and message.
   */
  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    queryRunner?: QueryRunner,
  ) {
    void queryRunner;
    switch (level) {
      case 'log':
        if (
          this._options === 'all' ||
          (this._options instanceof Array &&
            this._options.indexOf('log') !== -1)
        ) {
          this._logger.log(message);
        }
        break;
      case 'info':
        if (
          this._options === 'all' ||
          (this._options instanceof Array &&
            this._options.indexOf('info') !== -1)
        ) {
          this._logger.debug(message);
        }
        break;
      case 'warn':
        if (
          this._options === 'all' ||
          (this._options instanceof Array &&
            this._options.indexOf('warn') !== -1)
        ) {
          this._logger.warn(message);
        }
        break;
    }
  }

  /**
   * Converts parameters to a string.
   * Sometimes parameters can have circular objects and therefor we are handle this case too.
   */
  protected stringifyParams(parameters: unknown[]) {
    try {
      return JSON.stringify(parameters);
    } catch {
      // most probably circular objects in parameters
      return parameters;
    }
  }
}
