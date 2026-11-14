import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import config from './config';
import { TypeOrmLoggerContainer } from './typeOrmLogger';
import { Global, Module } from '@nestjs/common';

import { DataSource } from 'typeorm';
import { QueryGateway, queryBudgetsFromEnv } from './query-gateway';

const budgets = queryBudgetsFromEnv(process.env);
const options = config().typeOrmConfig;
const poolOptions =
  options.type === 'mysql' || options.type === 'mariadb'
    ? {
        connectionLimit: budgets.concurrency,
        waitForConnections: false,
        connectTimeout: budgets.acquisitionMs,
      }
    : options.type === 'postgres'
      ? {
          max: budgets.concurrency,
          connectionTimeoutMillis: budgets.acquisitionMs,
        }
      : {};
@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...config().typeOrmConfig,
      extra: { ...(options as { extra?: object }).extra, ...poolOptions },
      synchronize: false,
      migrationsRun: false,
      entities: [__dirname + '/entities/homeass/2024.1.5/*{.ts,.js}'],
      logger: TypeOrmLoggerContainer.ForConnection(
        'homeass',
        config().db.logging || ['error'],
      ),
      name: 'homeass',
      maxQueryExecutionTime: 1000,
    }),
  ],
  providers: [
    {
      provide: QueryGateway,
      inject: [getDataSourceToken('homeass')],
      useFactory: (source: DataSource) => new QueryGateway(source, budgets),
    },
  ],
  exports: [TypeOrmModule, QueryGateway],
})
export class DatabaseModule {}
