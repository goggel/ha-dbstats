import {useCallback, useState} from 'react';
import {Alert} from '@mui/material';
import apiClient from '../../apiClient';
import type {RequestOptions} from '../../requestQueue';
import {CountStatsChart} from './CountStatsChart';

export function AttributeSizeChart() {
    const [exact, setExact] = useState(false);
    const [sampledRows, setSampledRows] = useState<number | null>(null);
    const recent = useCallback(async (options?: RequestOptions) => {
        const [sample] = await apiClient.states.countRecentAttributesSize(options);
        if (!options?.signal?.aborted) { setSampledRows(sample.sampledRows); }
        return sample.rows;
    }, []);
    return <>
        <label>Attribute history scope{' '}
            <select value={exact ? 'exact' : 'recent'} onChange={event => { setSampledRows(null); setExact(event.target.value === 'exact'); }}>
                <option value="recent">Recent sample (default)</option>
                <option value="exact">Full history (exact, may time out)</option>
            </select>
        </label>
        <Alert severity="info">{exact
            ? 'Full history counts each shared attribute once per entity. It may take several minutes or time out. Switching views may not stop a running calculation immediately.'
            : `Recent sample: ${sampledRows === null ? 'up to 20,000' : sampledRows.toLocaleString('en-US')} most recent state rows (up to 20,000). Shows the top 20 entities by distinct shared attribute size within these rows. Results describe this sample, not the full database history.`}</Alert>
        <CountStatsChart key={exact ? 'exact' : 'recent'} api={exact ? apiClient.states.countAttributesSize : recent}
            title={`Shared attributes size, MB — ${exact ? 'Full history (exact)' : 'Recent sample'}`}/>
    </>;
}
