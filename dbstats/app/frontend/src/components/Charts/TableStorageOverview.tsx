import {useState} from 'react';
import {Alert, Box, Button, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography} from '@mui/material';
import type {ITableStorage} from '@dbstats/shared/src/stats';
import apiClient from '../../apiClient';
import {useRequest} from '../../useRequest';
import {Metric, RequestFeedback, storageSize} from './OverviewHelpers';

type SortKey = 'name' | 'dataBytes' | 'indexBytes' | 'totalBytes' | 'estimatedRows';
export function TableStorageOverview() {
    const request = useRequest(apiClient.system.getTableStorage);
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState<SortKey>('totalBytes');
    const [descending, setDescending] = useState(true);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const totals = request.data.reduce((sum, row) => ({data: sum.data + (row.dataBytes ?? 0), index: sum.index + (row.indexBytes ?? 0), total: sum.total + (row.totalBytes ?? 0)}), {data: 0, index: 0, total: 0});
    const rows = request.data.filter(row => `${row.schema}.${row.name}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => {
        const av = a[sort], bv = b[sort];
        if (av === null) { return bv === null ? a.name.localeCompare(b.name) : 1; }
        if (bv === null) { return -1; }
        const compared = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
        return (descending ? -compared : compared) || a.name.localeCompare(b.name);
    });
    const columns: Array<[SortKey, string]> = [['name', 'Table'], ['dataBytes', 'Data'], ['indexBytes', 'Indexes'], ['totalBytes', 'Total'], ['estimatedRows', 'Rows (estimate)']];
    const label = (row: ITableStorage) => row.schema === 'main' || row.schema === 'public' ? row.name : `${row.schema}.${row.name}`;
    return <Stack spacing={2} sx={{mt: 3}}>
        <Box sx={{display: 'flex', justifyContent: 'space-between', gap: 2}}><Typography variant="h4">Storage by table</Typography><Button onClick={request.retry} disabled={request.state === 'loading' || request.state === 'queued'}>Reload snapshot</Button></Box>
        <RequestFeedback {...request} label="Table storage"/>
        {request.state === 'empty' && <Alert severity="info">No user tables found.</Alert>}
        {request.state === 'success' && <>
            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 2}}>
                <Metric label="Tables" value={String(request.data.length)}/>
                <Metric label="Reported allocation" value={request.data.some(row => row.totalBytes !== null) ? storageSize(totals.total) : 'Unavailable'}/>
                <Metric label="Table data" value={request.data.some(row => row.dataBytes !== null) ? storageSize(totals.data) : 'Unavailable'}/>
                <Metric label="Indexes" value={request.data.some(row => row.indexBytes !== null) ? storageSize(totals.index) : 'Unavailable'}/>
            </Box>
            <Typography variant="body2" color="text.secondary">All user tables are listed. Sizes reflect allocated table and index storage, including engine-specific overhead, rather than database file size. Row counts are estimates where available. Snapshots are cached for up to five minutes.</Typography>
            {request.data.some(row => row.totalBytes === null) && <Alert severity="info">Some table sizes are unavailable. Totals and percentages include only reported sizes.</Alert>}
            <TextField label="Filter tables" value={filter} onChange={event => {setFilter(event.target.value); setPage(0);}} size="small"/>
            <TableContainer>
                <Table size="small" aria-label="Storage for every database table" sx={{minWidth: 720}}>
                    <TableHead><TableRow>{columns.map(([key, name]) => <TableCell key={key} align={key === 'name' ? 'left' : 'right'} sortDirection={sort === key ? (descending ? 'desc' : 'asc') : false}>
                        <TableSortLabel active={sort === key} direction={descending ? 'desc' : 'asc'} onClick={() => {setDescending(sort === key ? !descending : key !== 'name'); setSort(key); setPage(0);}}>{name}</TableSortLabel>
                    </TableCell>)}<TableCell align="right">Share of reported space</TableCell></TableRow></TableHead>
                    <TableBody>{rows.slice(page*pageSize, (page+1)*pageSize).map(row => <TableRow key={`${row.schema}.${row.name}`}>
                        <TableCell component="th" scope="row" sx={{userSelect: 'text'}}>{label(row)}</TableCell>
                        <TableCell align="right">{storageSize(row.dataBytes)}</TableCell>
                        <TableCell align="right">{storageSize(row.indexBytes)}</TableCell>
                        <TableCell align="right">{storageSize(row.totalBytes)}</TableCell>
                        <TableCell align="right">{row.estimatedRows === null ? '—' : Math.round(row.estimatedRows).toLocaleString()}</TableCell>
                        <TableCell align="right">{row.totalBytes === null || totals.total === 0 ? '—' : `${(row.totalBytes/totals.total*100).toFixed(1)}%`}</TableCell>
                    </TableRow>)}</TableBody>
                </Table>
            </TableContainer>
            {!rows.length && <Typography>No matching tables.</Typography>}
            <TablePagination component="div" count={rows.length} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10,25,50,100]} onPageChange={(_event, value) => setPage(value)} onRowsPerPageChange={event => {setPageSize(Number(event.target.value)); setPage(0);}}/>
        </>}
    </Stack>;
}
