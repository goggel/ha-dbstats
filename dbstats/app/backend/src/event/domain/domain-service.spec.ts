jest.mock('../../config', () => ({
  __esModule: true,
  default: () => ({ maxRowsInChart: 10 }),
}));
import type { QueryGateway } from '../../query-gateway';
import { EventService } from '../event.service';
import type { Repository } from 'typeorm';
import type { Events } from '../../entities/homeass/2024.1.5/Events';
import type { EventData } from '../../entities/homeass/2024.1.5/EventData';

describe('domain service SQL seam', () => {
  it('returns aggregate rows without hydrating payloads', async () => {
    const rows = [{ type: 'light', cnt: 100 }];
    const query = jest.fn().mockResolvedValue(rows);
    const find = jest.fn(() => {
      throw new Error('payload hydration');
    });
    const repo = {
      query,
      manager: { connection: { options: { type: 'sqlite' } } },
    };
    const service = new EventService(
      { query, runOperation: (work) => work() } as unknown as QueryGateway,
      repo as unknown as Repository<Events>,
      { find } as unknown as Repository<EventData>,
    );
    expect(await service.countEventsByDomain()).toEqual(rows);
    expect(query).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
  });
});

it('gates pre-16 PostgreSQL before parsing payloads or invoking missing primitives', async () => {
  const query = jest.fn().mockResolvedValue([{ version: '150018' }]);
  const gateway = {
    query,
    runOperation: (work: () => Promise<unknown>) => work(),
  };
  const repo = { manager: { connection: { options: { type: 'postgres' } } } };
  const service = new EventService(
    gateway as unknown as QueryGateway,
    repo as unknown as Repository<Events>,
    {} as Repository<EventData>,
  );
  await expect(service.countEventsByDomain()).rejects.toMatchObject({
    response: {
      code: 'DOMAIN_JSON_COMPATIBILITY',
      message:
        'The event-domain chart requires PostgreSQL 16 or newer. Other charts remain available.',
    },
  });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain('server_version_num');
});
