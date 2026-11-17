export interface ITableStorage {
  schema: string;
  name: string;
  dataBytes: number | null;
  indexBytes: number | null;
  totalBytes: number | null;
  estimatedRows: number | null;
}
export type CoverageWindow = 'day' | 'week' | 'retained';
export interface IStatisticCoverage {
  metadataId: number | null;
  statisticId: string | null;
  retainedRows: number;
  firstTs: number | null;
  lastTs: number | null;
  observed: number;
  expected: number;
  missing: number;
  coverage: number | null;
  status: 'complete' | 'gaps' | 'no_recent_data' | 'unknown' | 'pending';
}
export interface IStatisticsOverview {
  generatedAt: number;
  window: CoverageWindow;
  startTs: number | null;
  endTs: number;
  totalRows: number;
  statisticCount: number;
  oldestTs: number | null;
  newestTs: number | null;
  series: IStatisticCoverage[];
}
export interface IStatisticDay {
  dayTs: number;
  observed: number;
  expected: number;
  missing: number;
  coverage: number | null;
}
