import type { DataSource } from 'typeorm';
import {
  QueryGateway,
  defaultQueryBudgets,
  validateQueryBudgets,
  queryBudgetsFromEnv,
} from './query-gateway';

describe('QueryGateway lifecycle', () => {
  it('validates every environment budget without permissive parseInt fallback', () => {
    for (const key of [
      'DB_QUERY_TIMEOUT',
      'DB_ACQUISITION_TIMEOUT',
      'DB_QUEUE_TIMEOUT',
      'DB_QUERY_CONCURRENCY',
      'DB_QUERY_MAX_PENDING',
    ]) {
      for (const value of ['', '0', '-1', 'Infinity', '100ms', '1.2']) {
        expect(() => queryBudgetsFromEnv({ [key]: value })).toThrow();
      }
    }
    expect(queryBudgetsFromEnv({})).toEqual(defaultQueryBudgets);
  });
  it.each([NaN, Infinity, 0, -1, 1.5, 180001])(
    'rejects invalid finite execution budget %s',
    (value) => {
      expect(() =>
        validateQueryBudgets({ ...defaultQueryBudgets, executionMs: value }),
      ).toThrow();
    },
  );
  it('bounds concurrency and pending queue, expires queue wait and releases after errors', async () => {
    let finish: (value: unknown) => void;
    const runner = {
      connect: jest.fn().mockResolvedValue({ interrupt() {} }),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockRejectedValue(new Error('fixture')),
    };
    const source = {
      options: { type: 'sqlite' },
      createQueryRunner: () => runner,
    } as unknown as DataSource;
    const gateway = new QueryGateway(source, {
      executionMs: 1000,
      acquisitionMs: 100,
      queueMs: 20,
      concurrency: 4,
      maxPending: 1,
    });
    const first = gateway.query('first');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = expect(gateway.query('queued')).rejects.toMatchObject({
      response: { code: 'QUERY_TIMEOUT' },
    });
    await expect(gateway.query('full')).rejects.toMatchObject({
      response: { code: 'QUERY_BUSY' },
    });
    await second;
    finish!(42);
    expect(await first).toBe(42);
    await expect(gateway.query('error')).rejects.toThrow('fixture');
    expect(runner.release).toHaveBeenCalledTimes(2);
  });
  it('releases a late acquisition without admitting extra concurrent work', async () => {
    let connect: (value: unknown) => void;
    const runner = {
      connect: () =>
        new Promise((resolve) => {
          connect = resolve;
        }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const source = {
      options: { type: 'postgres' },
      createQueryRunner: () => runner,
    } as unknown as DataSource;
    const gateway = new QueryGateway(source, {
      executionMs: 100,
      acquisitionMs: 10,
      queueMs: 10,
      concurrency: 1,
      maxPending: 1,
    });
    await expect(gateway.query('late')).rejects.toMatchObject({
      response: { code: 'QUERY_TIMEOUT' },
    });
    await expect(gateway.query('queued')).rejects.toMatchObject({
      response: { code: 'QUERY_TIMEOUT' },
    });
    connect!({});
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});
