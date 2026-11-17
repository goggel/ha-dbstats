import {Alert, Button, Box, Typography} from '@mui/material';
import type {LoadState} from '../../useRequest';
import {sizeFormatter} from './sizeFormat';

export const storageSize = (bytes: number | null | undefined) => bytes === null || bytes === undefined ? 'Unavailable' : sizeFormatter(bytes / 1048576)(bytes / 1048576);
export const timestamp = (ts: number | null) => ts === null ? 'Unavailable' : `${new Date(ts * 1000).toLocaleString(undefined, {timeZone: 'UTC'})} UTC`;
export function RequestFeedback({state, error, elapsed, retry, label}: {state: LoadState; error: string; elapsed: number; retry: () => void; label: string}) {
    if (state === 'error' || state === 'timeout') {
        return <Alert severity="error">{label}: {error} <Button onClick={retry}>Retry</Button></Alert>;
    }
    if (state === 'queued' || state === 'loading') { return <div role="status">{label}: {state} ({elapsed}s)</div>; }
    return null;
}
export function Metric({label, value}: {label: string; value: string}) {
    return <Box sx={{minWidth: 145, flex: '1 1 145px', p: 2, bgcolor: 'background.default', borderRadius: 1}}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h4" sx={{mt: 1}}>{value}</Typography>
    </Box>;
}
