import { QueryGateway } from '../query-gateway';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Events } from '../entities/homeass/2024.1.5/Events';
import { EventTypes } from '../entities/homeass/2024.1.5/EventTypes';
import type { ICountStats } from '@dbstats/shared/src/stats';
import { EventData } from '../entities/homeass/2024.1.5/EventData';
import config from '../config';
import { domainQuery } from './domain/domain-query';

const { maxRowsInChart } = config();
@Injectable()
export class EventService {
  constructor(
    private readonly gateway: QueryGateway,
    @InjectRepository(Events, 'homeass')
    private repo: Repository<Events>,
    @InjectRepository(EventData, 'homeass')
    private repoEventData: Repository<EventData>,
  ) {}

  async countEventTypes(): Promise<Array<ICountStats>> {
    //select t.event_type_id, t.event_type, count(*) from event_types t, events e where t.event_type_id=e.event_type_id
    // group by t.event_type, t.event_type_id
    const data = await this.gateway.select<Array<ICountStats>>(
      this.repo
        .createQueryBuilder('events')
        .select('types.event_type type, count(*) cnt')
        .innerJoin(
          EventTypes,
          'types',
          'types.event_type_id=events.event_type_id',
        )
        .groupBy('types.event_type')
        .orderBy('cnt', 'DESC')
        .limit(maxRowsInChart),
    );
    return data;
  }

  async countEventsByDomain(): Promise<Array<ICountStats>> {
    return this.gateway.runOperation(async () => {
      const engine = this.repo.manager.connection.options.type;
      if (engine === 'postgres') {
        const rows = await this.gateway.query<Array<{ version: string }>>(
          "SELECT current_setting('server_version_num') AS version",
        );
        if (Number(rows[0].version) < 160000) {
          throw new ServiceUnavailableException({
            code: 'DOMAIN_JSON_COMPATIBILITY',
            message:
              'Safe domain aggregation requires a PostgreSQL compatibility decision',
          });
        }
      }
      return this.gateway.query<Array<ICountStats>>(
        domainQuery(engine, maxRowsInChart),
      );
    });
  }
}
