import {useCallback, useState} from 'react';
import {Alert, Box, Button, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography} from '@mui/material';
import type {CoverageWindow, IStatisticCoverage} from '@dbstats/shared/src/stats';
import type {RequestOptions} from '../../requestQueue';
import apiClient from '../../apiClient';
import {useRequest} from '../../useRequest';
import {Metric, RequestFeedback, storageSize, timestamp} from './OverviewHelpers';

const name = (row: IStatisticCoverage) => row.statisticId ?? `Unknown statistic (metadata ${row.metadataId ?? 'missing'})`;
const statusText = {complete: 'Complete', gaps: 'Missing buckets', no_recent_data: 'No recent buckets', unknown: 'Unknown metadata or timestamps', pending: 'No completed buckets yet'};
function DailyCoverage({series, close}: {series: IStatisticCoverage; close: () => void}) {
    const api = useCallback((options?: RequestOptions) => apiClient.statistic.getShortDays(series.metadataId, options), [series.metadataId]);
    const request = useRequest(api);
    return <Stack spacing={2} sx={{p: 2, border: 1, borderColor: 'divider', borderRadius: 1}}>
        <Box sx={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1}}><Typography variant="h4" sx={{overflowWrap: 'anywhere'}}>Daily coverage: {name(series)}</Typography><Button onClick={close}>Close detail</Button></Box>
        <Typography variant="body2">Last seven days, grouped by UTC date. The first and last dates can be partial days.</Typography>
        <RequestFeedback {...request} label="Daily coverage"/>
        {request.state === 'empty' && <Alert severity="info">No timestamped history found.</Alert>}
        {request.state === 'success' && <TableContainer><Table size="small" aria-label="Daily statistic coverage">
            <TableHead><TableRow>{['UTC date','Recorded buckets','Expected buckets','Missing','Coverage'].map(text=><TableCell key={text}>{text}</TableCell>)}</TableRow></TableHead>
            <TableBody>{request.data.map(day=><TableRow key={day.dayTs}><TableCell>{new Date(day.dayTs*1000).toISOString().slice(0,10)}</TableCell><TableCell>{day.observed}</TableCell><TableCell>{day.expected}</TableCell><TableCell>{day.missing}</TableCell><TableCell>{day.coverage === null ? 'Not yet observed' : `${day.coverage.toFixed(1)}%`}</TableCell></TableRow>)}</TableBody>
        </Table></TableContainer>}
    </Stack>;
}
export function ShortTermOverview() {
    const [window, setWindow] = useState<CoverageWindow>('day');
    const api = useCallback((options?: RequestOptions) => apiClient.statistic.getShortOverview(window, options), [window]);
    const request = useRequest(api);
    const storage = useRequest(apiClient.system.getTableStorage);
    const [filter, setFilter] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<IStatisticCoverage | null>(null);
    const summary = request.data[0];
    const table = storage.data.find(row=>row.name === 'statistics_short_term' && ['public','main'].includes(row.schema)) ?? (storage.data.filter(row=>row.name === 'statistics_short_term').length === 1 ? storage.data.find(row=>row.name === 'statistics_short_term') : undefined);
    const complete = summary?.series.filter(row=>row.status === 'complete').length ?? 0;
    const pending = summary?.series.filter(row=>row.status === 'pending').length ?? 0;
    const rows = summary?.series.filter(row=>(showAll || filter || !['complete','pending'].includes(row.status)) && name(row).toLowerCase().includes(filter.toLowerCase())) ?? [];
    return <Stack spacing={2}>
        <RequestFeedback {...request} label="Short-term statistics overview"/>
        {request.state === 'success' && summary?.window === window && <>
            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 2}}>
                <Metric label="Retained rows" value={summary.totalRows.toLocaleString()}/>
                <Metric label="Statistics with history" value={summary.statisticCount.toLocaleString()}/>
                <Metric label="Observed history span" value={summary.oldestTs === null ? 'No history' : `${((summary.newestTs-summary.oldestTs+300)/86400).toFixed(1)} days`}/>
                <Metric label="Table + indexes" value={storageSize(table?.totalBytes)}/>
            </Box>
            <Typography variant="body2">Oldest bucket: {timestamp(summary.oldestTs)} · Newest bucket: {timestamp(summary.newestTs)}</Typography>
            {table && <Typography variant="body2">Table data: {storageSize(table.dataBytes)} · Indexes: {storageSize(table.indexBytes)}</Typography>}
        </>}
        <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}>
            <TextField label="Coverage period" select value={window} onChange={event=>{setWindow(event.target.value as CoverageWindow);setPage(0);setSelected(null);}} size="small" sx={{minWidth: 185}}>
                <MenuItem value="day">Last 24 hours</MenuItem><MenuItem value="week">Last 7 days</MenuItem><MenuItem value="retained">All retained history</MenuItem>
            </TextField>
            <TextField label="Search statistics" value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}} size="small" sx={{flex: 1}}/>
            <Button onClick={()=>{setShowAll(!showAll);setPage(0);}}>{showAll ? 'Show exceptions only' : 'Show all statistics'}</Button>
            <Button onClick={()=>{setPage(0);request.retry();storage.retry();}} disabled={request.state === 'loading' || request.state === 'queued'}>Reload snapshot</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">Totals use all retained history. Coverage checks completed five-minute buckets, with ten minutes of grace. Periods before the first retained observation are not assessed. Missing buckets can reflect entity unavailability or recorder downtime. Snapshots are cached for up to five minutes.</Typography>
        {request.state === 'success' && summary?.window === window && <>
            {!summary.series.length ? <Alert severity="info">No short-term statistics are retained.</Alert> : <Typography>Statistics with complete coverage for this period: {complete.toLocaleString()}</Typography>}
            {pending > 0 && <Typography>Statistics without completed buckets to assess yet: {pending.toLocaleString()}</Typography>}
            <Typography variant="body2" color="text.secondary">Snapshot: {timestamp(summary.generatedAt)} · Coverage assessed up to: {timestamp(summary.endTs)}</Typography>
            {!rows.length && summary.series.length > 0 && <Alert severity={filter ? 'info' : 'success'}>{filter ? 'No matching statistics.' : 'No coverage exceptions found.'}</Alert>}
            {rows.length > 0 && <>
                <TableContainer><Table size="small" aria-label="Short-term statistic coverage" sx={{minWidth: 880}}>
                    <TableHead><TableRow>{['Statistic','Status','Last bucket (UTC)','Missing buckets','Coverage','Retained rows','Detail'].map(text=><TableCell key={text}>{text}</TableCell>)}</TableRow></TableHead>
                    <TableBody>{rows.slice(page*25,(page+1)*25).map(row=><TableRow key={String(row.metadataId)}>
                        <TableCell component="th" scope="row" sx={{userSelect: 'text'}}>{name(row)}</TableCell>
                        <TableCell><Chip size="small" label={statusText[row.status]} color={row.status === 'complete' ? 'success' : 'default'}/></TableCell>
                        <TableCell>{timestamp(row.lastTs)}</TableCell><TableCell>{row.missing.toLocaleString()}</TableCell><TableCell>{row.coverage === null ? '—' : `${row.coverage.toFixed(1)}%`}</TableCell><TableCell>{row.retainedRows.toLocaleString()}</TableCell>
                        <TableCell><Button disabled={row.metadataId === null} onClick={()=>setSelected(row)} aria-label={`Daily coverage for ${name(row)}`}>View</Button></TableCell>
                    </TableRow>)}</TableBody>
                </Table></TableContainer>
                <TablePagination component="div" count={rows.length} page={page} rowsPerPage={25} rowsPerPageOptions={[25]} onPageChange={(_event,value)=>setPage(value)}/>
            </>}
        </>}
        {selected && <DailyCoverage key={selected.metadataId} series={selected} close={()=>setSelected(null)}/>}
    </Stack>;
}
