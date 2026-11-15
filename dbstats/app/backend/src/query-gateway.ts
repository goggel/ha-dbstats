import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import {
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  DataSource,
  QueryRunner,
  SelectQueryBuilder,
  ObjectLiteral,
} from 'typeorm';

export interface QueryBudgets {
  executionMs: number;
  acquisitionMs: number;
  queueMs: number;
  concurrency: number;
  maxPending: number;
}
export const defaultQueryBudgets: QueryBudgets = {
  executionMs: 180000,
  acquisitionMs: 5000,
  queueMs: 5000,
  concurrency: 1,
  maxPending: 32,
};
export function validateQueryBudgets(value: QueryBudgets): QueryBudgets {
  for (const key of Object.keys(
    defaultQueryBudgets,
  ) as (keyof QueryBudgets)[]) {
    const max =
      key === 'concurrency' ? 32 : key === 'maxPending' ? 1024 : 180000;
    if (
      !Number.isSafeInteger(value[key]) ||
      value[key] < 1 ||
      value[key] > max
    ) {
      throw new Error(`Invalid query budget: ${key}`);
    }
  }
  if (value.executionMs + value.queueMs + value.acquisitionMs > 200000) {
    throw new Error('Combined query budgets must not exceed 200000ms');
  }
  return { ...value };
}
export function queryBudgetsFromEnv(env: NodeJS.ProcessEnv): QueryBudgets {
  return validateQueryBudgets({
    executionMs:
      env.DB_QUERY_TIMEOUT === undefined
        ? 180000
        : Number(env.DB_QUERY_TIMEOUT),
    acquisitionMs:
      env.DB_ACQUISITION_TIMEOUT === undefined
        ? 5000
        : Number(env.DB_ACQUISITION_TIMEOUT),
    queueMs:
      env.DB_QUEUE_TIMEOUT === undefined ? 5000 : Number(env.DB_QUEUE_TIMEOUT),
    concurrency:
      env.DB_QUERY_CONCURRENCY === undefined
        ? 1
        : Number(env.DB_QUERY_CONCURRENCY),
    maxPending:
      env.DB_QUERY_MAX_PENDING === undefined
        ? 32
        : Number(env.DB_QUERY_MAX_PENDING),
  });
}
function timeout() {
  return new RequestTimeoutException({
    code: 'QUERY_TIMEOUT',
    message: 'Database query deadline exceeded',
  });
}
function cancelled() {
  return new RequestTimeoutException({
    code: 'QUERY_CANCELLED',
    message: 'Database query cancelled',
  });
}
interface Waiter {
  start: () => void;
}

/** Own the DataSource exclusively: SQLite interrupt is connection-wide. Never mix
 * direct repository/runner access with this gateway on a SQLite DataSource. */
export class QueryGateway {
  private readonly operation = new AsyncLocalStorage<{ deadline: number }>();

  runOperation<T>(work: () => Promise<T>): Promise<T> {
    if (this.operation.getStore()) {
      return work();
    }
    return this.operation.run(
      {
        deadline:
          performance.now() +
          this.budgets.executionMs +
          this.budgets.queueMs +
          this.budgets.acquisitionMs,
      },
      work,
    );
  }

  private remaining(): number {
    const deadline = this.operation.getStore()?.deadline;
    const remaining =
      deadline === undefined
        ? this.budgets.executionMs
        : Math.ceil(deadline - performance.now());
    if (remaining <= 0) {
      throw timeout();
    }
    return remaining;
  }

  private active = 0;
  private pending: Waiter[] = [];
  readonly budgets: QueryBudgets;
  constructor(
    private readonly source: DataSource,
    budgets = defaultQueryBudgets,
  ) {
    this.budgets = validateQueryBudgets(budgets);
  }

  async select<T = ObjectLiteral[]>(
    builder: SelectQueryBuilder<ObjectLiteral>,
  ): Promise<T> {
    const [sql, parameters] = builder.getQueryAndParameters();
    return this.query<T>(sql, parameters);
  }

  private async enter(signal?: AbortSignal): Promise<void> {
    this.remaining();
    if (signal?.aborted) {
      throw cancelled();
    }
    const limit =
      this.source.options.type === 'sqlite' ? 1 : this.budgets.concurrency;
    if (this.active < limit) {
      this.active++;
      return;
    }
    if (this.pending.length >= this.budgets.maxPending) {
      throw new ServiceUnavailableException({
        code: 'QUERY_BUSY',
        message: 'Database query queue full',
      });
    }
    await new Promise<void>((resolve, reject) => {
      // Callbacks close over each other; none runs before initialization.
      /* eslint-disable no-use-before-define */
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      const remove = () => {
        this.pending = this.pending.filter((x) => x !== waiter);
        cleanup();
      };
      const abort = () => {
        remove();
        reject(cancelled());
      };
      const waiter = {
        start: () => {
          cleanup();
          this.active++;
          resolve();
        },
      };
      const timer = setTimeout(
        () => {
          remove();
          reject(timeout());
        },
        Math.min(this.budgets.queueMs, this.remaining()),
      );
      this.pending.push(waiter);
      signal?.addEventListener('abort', abort, { once: true });
      /* eslint-enable no-use-before-define */
    });
  }

  private leave() {
    this.active--;
    this.pending.shift()?.start();
  }

  async query<T = ObjectLiteral[]>(
    sql: string,
    parameters: unknown[] = [],
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.operation.getStore()) {
      return this.runOperation(() => this.query<T>(sql, parameters, signal));
    }
    await this.enter(signal);
    let runner: QueryRunner;
    try {
      runner = this.source.createQueryRunner();
    } catch {
      this.leave();
      throw new ServiceUnavailableException({
        code: 'QUERY_FAILED',
        message: 'Database query failed',
      });
    }
    let deferredCleanup = false;
    try {
      this.remaining();
      const connection = runner.connect();
      let timer: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          connection,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(timeout()),
              Math.min(this.budgets.acquisitionMs, this.remaining()),
            );
          }),
        ]);
      } catch (error) {
        deferredCleanup = true;
        void connection
          .then(
            async () => {
              await runner.release();
            },
            async () => {
              await runner.release();
            },
          )
          .finally(() => this.leave())
          .catch(() => undefined);
        throw error;
      } finally {
        clearTimeout(timer!);
      }
      if (signal?.aborted) {
        throw cancelled();
      }
      return await this.execute<T>(runner, sql, parameters, signal);
    } catch (error) {
      if (
        error instanceof RequestTimeoutException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException({
        code: 'QUERY_FAILED',
        message: 'Database query failed',
      });
    } finally {
      try {
        if (!deferredCleanup) {
          await runner.release();
        }
      } finally {
        if (!deferredCleanup) {
          this.leave();
        }
      }
    }
  }

  private async execute<T>(
    runner: QueryRunner,
    sql: string,
    parameters: unknown[],
    signal?: AbortSignal,
  ): Promise<T> {
    const ms = Math.min(this.budgets.executionMs, this.remaining());
    const type = this.source.options.type;
    let interrupt: (() => void) | undefined;
    if (type === 'mysql' || type === 'mariadb') {
      const rows = await runner.query('SELECT VERSION() AS version');
      const maria = /mariadb/i.test(String(rows[0].version));
      // All interpolated values are bounded integers validated at construction.
      await runner.query(
        maria
          ? `SET SESSION max_statement_time = ${ms / 1000}`
          : `SET SESSION max_execution_time = ${ms}`,
      );
    } else if (type === 'postgres') {
      await runner.query(`SET statement_timeout = ${ms}`);
    } else if (type === 'sqlite') {
      const handle = await runner.connect();
      if (typeof handle.interrupt !== 'function') {
        throw new Error('SQLite native interruption unavailable');
      }
      interrupt = () => handle.interrupt();
    } else {
      throw new Error('Unsupported query deadline driver');
    }
    let expired = false;
    const timer = interrupt
      ? setTimeout(() => {
          expired = true;
          interrupt!();
        }, ms)
      : undefined;
    const abort = () => interrupt?.();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) {
        throw cancelled();
      }
      this.remaining();
      const result = await runner.query(sql, parameters);
      this.remaining();
      if (signal?.aborted) {
        throw cancelled();
      }
      if (expired) {
        throw timeout();
      }
      return result as T;
    } catch (error) {
      if (signal?.aborted) {
        throw cancelled();
      }
      const code = error?.driverError?.code;
      if (
        expired ||
        ((type === 'mysql' || type === 'mariadb') &&
          error?.driverError?.errno === 1969) ||
        [
          'SQLITE_INTERRUPT',
          '57014',
          'ER_QUERY_TIMEOUT',
          'ER_STATEMENT_TIMEOUT',
        ].includes(code)
      ) {
        throw timeout();
      }
      if (error instanceof RequestTimeoutException) {
        throw error;
      }
      throw new ServiceUnavailableException({
        code: 'QUERY_FAILED',
        message: 'Database query failed',
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      signal?.removeEventListener('abort', abort);
    }
  }
}
