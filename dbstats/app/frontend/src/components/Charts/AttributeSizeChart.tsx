import {Alert} from '@mui/material';
import apiClient from '../../apiClient';
import {CountStatsChart} from './CountStatsChart';

export function AttributeSizeChart() {
    return <>
        <Alert severity="info">Full-history attribute payload size per entity. Shared payloads are counted once per entity, so totals can overlap between entities. Large histories can take several minutes to scan.</Alert>
        <CountStatsChart api={apiClient.states.countAttributesSize} sizeInMiB
            title="Shared attribute payload size — Full history"/>
    </>;
}
