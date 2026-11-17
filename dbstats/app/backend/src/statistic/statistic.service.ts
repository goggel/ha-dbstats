import { QueryGateway } from '../query-gateway';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatisticsShortTerm } from '../entities/homeass/2024.1.5/StatisticsShortTerm';
import { Statistics } from '../entities/homeass/2024.1.5/Statistics';
import { StatisticsMeta } from '../entities/homeass/2024.1.5/StatisticsMeta';
import type {
  ICountStats,
  IStatisticsOverview,
  IStatisticDay,
} from '@dbstats/shared/src/stats';
import config from '../config';
import { statisticsOverview, statisticDays, coverageBounds } from './coverage';
import { SnapshotCache } from '../snapshot-cache';

const { maxRowsInChart } = config();

@Injectable()
export class StatisticService {
  private readonly overviewCache = new SnapshotCache<IStatisticsOverview[]>();
  private readonly daysCache = new SnapshotCache<IStatisticDay[]>();
  constructor(
    private readonly gateway: QueryGateway,
    @InjectRepository(StatisticsShortTerm, 'homeass')
    private repoShort: Repository<StatisticsShortTerm>,
    @InjectRepository(Statistics, 'homeass')
    private repoLong: Repository<Statistics>,
  ) {}

  getShortOverview(window: string) {
    coverageBounds(window);
    return this.overviewCache.get(window, () =>
      this.gateway.runOperation(() => statisticsOverview(this.gateway, window)),
    );
  }

  getShortDays(id: number) {
    return this.daysCache.get(String(id), () =>
      this.gateway.runOperation(() => statisticDays(this.gateway, id)),
    );
  }

  async countStatsShort(): Promise<Array<ICountStats>> {
    //select m.statistic_id, count(1) from statistics s, statistics_meta m where s.metadata_id=m.id group by m.statistic_id
    const data = await this.gateway.select<Array<ICountStats>>(
      this.repoShort
        .createQueryBuilder('statistics')
        .select('meta.statistic_id type, count(*) cnt')
        .innerJoin(StatisticsMeta, 'meta', 'statistics.metadata_id=meta.id')
        .groupBy('meta.statistic_id')
        .orderBy('cnt', 'DESC')
        .limit(maxRowsInChart),
    );
    return data;
  }

  async countStatsLong(): Promise<Array<ICountStats>> {
    //select m.entity_id, count(1) from statistics s, states_meta m where s.metadata_id=m.metadata_id group by m.entity_id
    const data = await this.gateway.select<Array<ICountStats>>(
      this.repoLong
        .createQueryBuilder('statistics')
        .select('meta.statistic_id type, count(*) cnt')
        .innerJoin(StatisticsMeta, 'meta', 'statistics.metadata_id=meta.id')
        .groupBy('meta.statistic_id')
        .orderBy('cnt', 'DESC')
        .limit(maxRowsInChart),
    );
    return data;
  }
}
