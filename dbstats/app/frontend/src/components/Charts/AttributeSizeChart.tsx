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
            ? 'Full history: each shared attribute counted once per entity. This expensive query may time out. Switching modes cancels browser subscriptions; database work may continue until its deadline.'
            : `Recent sample: ${sampledRows === null ? 'up to 20,000' : sampledRows.toLocaleString('en-US')} most recent state rows by state ID (limit 20,000), before joins. Each distinct shared attribute counts once per entity within these rows. At most 20 entities within this sample; this is not a representative global sample or an estimate of full-history unique attribute size or global top 20.`}</Alert>
        <CountStatsChart key={exact ? 'exact' : 'recent'} api={exact ? apiClient.states.countAttributesSize : recent}
            title={`Shared attributes size, MB — ${exact ? 'Full history (exact)' : 'Recent sample'}`}/>
    </>;
}
