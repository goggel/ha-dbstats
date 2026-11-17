import type {ICountStats, IShowAlerts, ITableStorage, IStatisticsOverview, IStatisticDay, CoverageWindow} from '@dbstats/shared/src/stats';
import {request} from './requestQueue';
import type {RequestOptions} from './requestQueue';
const count = (path: string) => (options?: RequestOptions) => request<ICountStats>(`/addon-api/${path}`, options);
export default {
    events: {countEventTypes: count('event/countEventTypes'), countEventsByDomain: count('event/countEventsByDomain')},
    states: {countRecentAttributesSize: (options?: RequestOptions) => request<{basis: 'recent-state-ids'; rowLimit: number; sampledRows: number; rows: ICountStats[]}>('/addon-api/state/countRecentAttributesSize', options), countStates: count('state/countStates'), countAttributesSize: count('state/countAttributesSize')},
    statistic: {countLong: count('statistic/long/count'), countShort: count('statistic/short/count'),
        getShortOverview: (window: CoverageWindow, options?: RequestOptions) => request<IStatisticsOverview>(`/addon-api/statistic/short/overview?window=${window}`, options),
        getShortDays: (metadataId: number, options?: RequestOptions) => request<IStatisticDay>(`/addon-api/statistic/short/days?metadataId=${metadataId}`, options)},
    system: {getTableSize: count('system/getTableSize'), getTableRows: count('system/getTableRows'),
        getTableStorage: (options?: RequestOptions) => request<ITableStorage>('/addon-api/system/getTableStorage', options, false),
        getDbAlerts: (options?: RequestOptions) => request<IShowAlerts>('/addon-api/system/getDbAlerts', options)}
};
