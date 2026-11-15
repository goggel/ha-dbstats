import {useEffect, useState} from 'react';
import type {RequestOptions} from './requestQueue';
import {RequestTimeoutError} from './requestQueue';
export type LoadState = 'queued' | 'loading' | 'success' | 'empty' | 'timeout' | 'error';
export function useRequest<T>(api: (options?: RequestOptions) => Promise<T[]>) {
    const [state, setState] = useState<LoadState>('queued');
    const [data, setData] = useState<T[]>([]);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        const started = Date.now();
        setState('queued'); setError(''); setElapsed(0);
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        Promise.resolve().then(() => {
            if (controller.signal.aborted) { return []; }
            return api({signal: controller.signal, onPhase: phase => { if (!controller.signal.aborted) { setState(phase); } }});
        }).then(result => {
            if (!controller.signal.aborted) { setData(result); setState(result.length ? 'success' : 'empty'); }
        }).catch(reason => {
            if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Request failed'); setState(reason instanceof RequestTimeoutError ? 'timeout' : 'error'); }
        }).finally(() => clearInterval(timer));
        return () => { controller.abort(); clearInterval(timer); };
    }, [api, attempt]);
    return {state, data, error, elapsed, retry: () => setAttempt(value => value + 1)};
}
