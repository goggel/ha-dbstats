import { QueryGateway } from '../query-gateway';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { States } from '../entities/homeass/2024.1.5/States';
import { StatesMeta } from '../entities/homeass/2024.1.5/StatesMeta';
import type { ICountStats } from '@dbstats/shared/src/stats';
import { StateAttributes } from '../entities/homeass/2024.1.5/StateAttributes';
import config from '../config';

const { maxRowsInChart } = config();

const badRoundFunction = (num) => Math.round(num * 100) / 100;

@Injectable()
export class StateService {
  constructor(
    private readonly gateway: QueryGateway,
    @InjectRepository(States, 'homeass')
    private statesRepository: Repository<States>,
    @InjectRepository(StateAttributes, 'homeass')
    private stateAttributesRepository: Repository<StateAttributes>,
  ) {}

  async countStateTypes(): Promise<Array<ICountStats>> {
    //select m.entity_id, count(1) from states s, states_meta m where s.metadata_id=m.metadata_id group by m.entity_id
    const data = await this.gateway.select<Array<ICountStats>>(
      this.statesRepository
        .createQueryBuilder('states')
        .select('states_meta.entity_id type, count(*) cnt')
        .innerJoin(
          StatesMeta,
          'states_meta',
          'states.metadata_id=states_meta.metadata_id',
        )
        .groupBy('states_meta.entity_id')
        .orderBy('cnt', 'DESC')
        .limit(maxRowsInChart),
    );
    return data;
  }

  // LIMIT is inside the fact-table CTE, before any joins or pair deduplication.
  async countRecentAttributesSize() {
    const result = (await this.gateway.query(`WITH recent AS (
select state_id, metadata_id, attributes_id from states order by state_id desc limit 20000
), pairs AS (
select m.entity_id, r.attributes_id, max(r.sampled_rows) sampled_rows
from (select recent.*, count(*) over () sampled_rows from recent) r
left join states_meta m on m.metadata_id=r.metadata_id
group by m.entity_id, r.attributes_id
), totals AS (
select pairs.entity_id type,
sum(case when pairs.entity_id is not null then octet_length(a.shared_attrs) end)/1024.0/1024.0 size,
max(pairs.sampled_rows) sampled_rows, count(a.attributes_id) attribute_count from pairs
left join state_attributes a on a.attributes_id=pairs.attributes_id group by pairs.entity_id
)
select type, size, max(sampled_rows) over () sampled_rows from totals
order by case when type is null or attribute_count=0 then 1 else 0 end, size desc limit ${maxRowsInChart}`)) as Array<{
      sampled_rows: number;
      type: string;
      size: number;
    }>;
    // A singleton envelope keeps the API's array contract, even with no categories.
    return [
      {
        basis: 'recent-state-ids' as const,
        rowLimit: 20000,
        sampledRows: Number(result[0]?.sampled_rows ?? 0),
        rows: result
          .filter((row) => row.type !== null && row.size > 0.01)
          .map((row) => ({ type: row.type, cnt: badRoundFunction(row.size) })),
      },
    ];
  }

  async countAttributesSize(): Promise<Array<ICountStats>> {
    // Deduplicate shared payloads per entity across all retained history.
    // Keep MiB precision here; display units and rounding belong to the chart.
    const query = `select attr2entity.entity_id type, sum(octet_length(a.shared_attrs)) size
from (select distinct state_attributes.attributes_id, states_meta.entity_id from state_attributes, states, states_meta
where state_attributes.attributes_id=states.attributes_id and states_meta.metadata_id=states.metadata_id) attr2entity, state_attributes a
where a.attributes_id=attr2entity.attributes_id group by attr2entity.entity_id order by size desc limit ${maxRowsInChart}`;

    const res = (await this.gateway.query(query)) as Array<{
      type: string;
      size: number;
    }>;
    return res
      .filter((el) => Number(el.size) > 0)
      .map((el) => {
        return {
          type: el.type,
          cnt: Number(el.size) / 1024 / 1024,
        };
      });
    /*
    Old version:
    const attributesLength = (await this.stateAttributesRepository
      .createQueryBuilder('a')
      .select('a.attributes_id, length(a.shared_attrs) len')
      .execute()) as Array<{ len: number; attributes_id: number }>;
    const attributesToEntityId = (await this.statesRepository
      .createQueryBuilder('s')
      .select('distinct s.attributes_id,m.entity_id')
      .innerJoin(StatesMeta, 'm', 's.metadata_id=m.metadata_id')
      .execute()) as Array<{ attributes_id: number; entity_id: string }>;

    const attributesToEntityIdMap = attributesToEntityId.reduce((res, item) => {
      res[item.attributes_id] = item.entity_id;
      return res;
    }, {});

    const byEntity = attributesLength.reduce((res, item) => {
      if (!res[attributesToEntityIdMap[item.attributes_id]]) {
        res[attributesToEntityIdMap[item.attributes_id]] = 0;
      }
      res[attributesToEntityIdMap[item.attributes_id]] += item.len;
      return res;
    }, {});

    const res = Object.keys(byEntity)
      .sort((a, b) => byEntity[b] - byEntity[a])
      .slice(0, 10)
      .map((key) => {
        return {
          type: key,
          cnt: badRoundFunction(byEntity[key] / 1024 / 1024),
        };
      });
    return res;*/
  }
}
