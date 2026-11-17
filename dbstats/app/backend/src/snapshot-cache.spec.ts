import { SnapshotCache } from './snapshot-cache';

afterEach(() => jest.useRealTimers());
it('shares concurrent loads, expires successful snapshots and does not cache failures', async () => {
  jest.useFakeTimers();
  const cache = new SnapshotCache<number>(300000);
  let complete: (value: number) => void;
  const load = jest.fn(
    () =>
      new Promise<number>((resolve) => {
        complete = resolve;
      }),
  );
  const first = cache.get('one', load),
    second = cache.get('one', load);
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  complete(42);
  await expect(first).resolves.toBe(42);
  await expect(second).resolves.toBe(42);
  await expect(cache.get('one', load)).resolves.toBe(42);
  jest.advanceTimersByTime(300001);
  await expect(cache.get('one', async () => 43)).resolves.toBe(43);
  await expect(
    cache.get('error', async () => {
      throw new Error('Failed');
    }),
  ).rejects.toThrow('Failed');
  await expect(cache.get('error', async () => 44)).resolves.toBe(44);
});
