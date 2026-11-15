import type {ICountStats, IShowAlerts} from '@dbstats/shared/src/stats';
import {request} from './requestQueue';
import type {RequestOptions} from './requestQueue';
const count = (path: string) => (options?: RequestOptions) => request<ICountStats>(`/addon-api/${path}`, options);
export default {
    events: {countEventTypes: count('event/countEventTypes'), countEventsByDomain: count('event/countEventsByDomain')},
    states: {countStates: count('state/countStates'), countAttributesSize: count('state/countAttributesSize')},
    statistic: {countLong: count('statistic/long/count'), countShort: count('statistic/short/count')},
    system: {getTableSize: count('system/getTableSize'), getTableRows: count('system/getTableRows'),
        getDbAlerts: (options?: RequestOptions) => request<IShowAlerts>('/addon-api/system/getDbAlerts', options)}
};
