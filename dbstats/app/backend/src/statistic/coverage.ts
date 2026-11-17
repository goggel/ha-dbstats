import { BadRequestException } from '@nestjs/common';
import type {
  CoverageWindow,
  IStatisticCoverage,
  IStatisticsOverview,
  IStatisticDay,
} from '@dbstats/shared/src/stats';
import type { QueryGateway } from '../query-gateway';

const BUCKET = 300;
export function coverageBounds(
  window: string,
  now = Date.now(),
): { window: CoverageWindow; startTs: number | null; endTs: number } {
  if (!['day', 'week', 'retained'].includes(window)) {
    throw new BadRequestException('window must be day, week or retained');
  }
  // Only evaluate completed buckets, with ten minutes of compilation grace.
  const endTs = Math.floor((now / 1000 - 600) / BUCKET) * BUCKET;
  return {
    window: window as CoverageWindow,
    startTs:
      window === 'retained'
        ? null
        : endTs - (window === 'day' ? 86400 : 604800),
    endTs,
  };
}
function counts(observed: number, start: number, end: number) {
  const expected = Math.max(0, Math.ceil((end - start) / BUCKET));
  const missing = Math.max(0, expected - observed);
  return {
    observed,
    expected,
    missing,
    coverage: expected ? Math.min(100, (observed / expected) * 100) : null,
  };
}
export async function statisticsOverview(
  gateway: QueryGateway,
  window: string,
  now = Date.now(),
): Promise<IStatisticsOverview[]> {
  const bounds = coverageBounds(window, now);
  const condition = `${bounds.startTs === null ? '' : `s.start_ts>=${bounds.startTs} AND `}s.start_ts<${bounds.endTs}`;
  // Aggregate index columns first. Metadata is joined only to the compact result.
  const rows = await gateway.query<
    Array<{
      metadata_id: number | null;
      statistic_id: string | null;
      retained_rows: string | number;
      first_ts: string | number | null;
      last_ts: string | number | null;
      observed: string | number;
    }>
  >(`
    SELECT a.*,m.statistic_id FROM (SELECT s.metadata_id,COUNT(*) retained_rows,
      MIN(s.start_ts) first_ts,MAX(s.start_ts) last_ts,
      SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END) observed
      FROM statistics_short_term s GROUP BY s.metadata_id) a
    LEFT JOIN statistics_meta m ON m.id=a.metadata_id`);
  const series: IStatisticCoverage[] = rows.map((row) => {
    const firstTs = row.first_ts === null ? null : Number(row.first_ts);
    const lastTs = row.last_ts === null ? null : Number(row.last_ts);
    const result = counts(
      Number(row.observed),
      Math.max(
        bounds.startTs ?? firstTs ?? bounds.endTs,
        firstTs ?? bounds.endTs,
      ),
      bounds.endTs,
    );
    const status =
      firstTs === null || row.statistic_id === null
        ? 'unknown'
        : !result.expected
          ? 'pending'
          : !result.missing
            ? 'complete'
            : lastTs < bounds.endTs - 3 * BUCKET
              ? 'no_recent_data'
              : 'gaps';
    return {
      metadataId: row.metadata_id === null ? null : Number(row.metadata_id),
      statisticId: row.statistic_id,
      retainedRows: Number(row.retained_rows),
      firstTs,
      lastTs,
      ...result,
      status,
    };
  });
  series.sort(
    (a, b) =>
      b.missing - a.missing ||
      (a.lastTs ?? 0) - (b.lastTs ?? 0) ||
      (a.statisticId ?? '').localeCompare(b.statisticId ?? ''),
  );
  const firsts = series.flatMap((row) =>
    row.firstTs === null ? [] : [row.firstTs],
  );
  const lasts = series.flatMap((row) =>
    row.lastTs === null ? [] : [row.lastTs],
  );
  return [
    {
      generatedAt: Math.floor(now / 1000),
      ...bounds,
      totalRows: series.reduce((total, row) => total + row.retainedRows, 0),
      statisticCount: series.filter((row) => row.statisticId !== null).length,
      oldestTs: firsts.length ? Math.min(...firsts) : null,
      newestTs: lasts.length ? Math.max(...lasts) : null,
      series,
    },
  ];
}
export async function statisticDays(
  gateway: QueryGateway,
  id: number,
  now = Date.now(),
): Promise<IStatisticDay[]> {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new BadRequestException('metadataId must be a positive integer');
  }
  const { startTs, endTs } = coverageBounds('week', now);
  const first = await gateway.query<
    Array<{ first_ts: string | number | null }>
  >(
    `SELECT MIN(start_ts) first_ts FROM statistics_short_term WHERE metadata_id=${id}`,
  );
  if (first[0]?.first_ts === null || !first.length) {
    return [];
  }
  const firstTs = Number(first[0].first_ts);
  const rows = await gateway.query<
    Array<{ day_ts: string | number; observed: string | number }>
  >(`SELECT FLOOR(start_ts/86400)*86400 day_ts,COUNT(*) observed FROM statistics_short_term
    WHERE metadata_id=${id} AND start_ts>=${startTs} AND start_ts<${endTs} GROUP BY FLOOR(start_ts/86400)*86400`);
  const observed = new Map(
    rows.map((row) => [Number(row.day_ts), Number(row.observed)]),
  );
  const days: IStatisticDay[] = [];
  for (
    let day = Math.floor(startTs / 86400) * 86400;
    day < endTs;
    day += 86400
  ) {
    days.push({
      dayTs: day,
      ...counts(
        observed.get(day) ?? 0,
        Math.max(day, startTs, firstTs),
        Math.min(day + 86400, endTs),
      ),
    });
  }
  return days;
}
