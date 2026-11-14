export type RequestPhase = 'queued' | 'loading';
export type RequestOptions = {signal?: AbortSignal; onPhase?: (phase: RequestPhase) => void};
export class RequestTimeoutError extends Error {
    constructor() { super('Request timed out. Browser timeout does not cancel database work.'); this.name = 'RequestTimeoutError'; }
}
// Server budget initially 180s, with at least 10s transport grace. Override at build time.
const configured = Number(process.env.REACT_APP_REQUEST_TIMEOUT_MS);
export const REQUEST_TIMEOUT_MS = process.env.REACT_APP_REQUEST_TIMEOUT_MS === undefined ? 210000 : configured;
if (!Number.isSafeInteger(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 210000 || REQUEST_TIMEOUT_MS > 300000) { throw new Error('Invalid REACT_APP_REQUEST_TIMEOUT_MS (210000..300000)'); }
type Consumer = {resolve: (value: any) => void; reject: (reason: Error) => void; phase?: RequestOptions['onPhase']; cleanup: () => void};
type Entry = {url: string; heavy: boolean; phase: RequestPhase; consumers: Set<Consumer>; controller: AbortController; abandon?: ReturnType<typeof setTimeout>; cancel?: () => void};
const entries = new Map<string, Entry>();
const queue: Entry[] = [];
let active = 0;
async function execute(entry: Entry) {
    entry.phase = 'loading';
    entry.consumers.forEach(c => c.phase?.('loading'));
    let timer: ReturnType<typeof setTimeout>;
    try {
        const deadline = new Promise<never>((_, reject) => {
            entry.cancel = () => { reject(new Error('Request abandoned')); entry.controller.abort(); };
            timer = setTimeout(() => { reject(new RequestTimeoutError()); entry.controller.abort(); }, REQUEST_TIMEOUT_MS);
        });
        const fetchData = async () => {
            const response = await fetch(entry.url, {method: 'GET', credentials: 'same-origin', cache: 'no-cache', mode: 'cors', headers: {'Content-Type': 'application/json'}, signal: entry.controller.signal});
            if (!response.ok) {
                let message = `Request failed (HTTP ${response.status})`;
                try {
                    const body = await response.json();
                    if (body.code === 'QUERY_TIMEOUT') { throw new RequestTimeoutError(); }
                    const detail = Array.isArray(body.message) ? body.message.join('; ') : body.message;
                    if (typeof detail === 'string') { message += `: ${detail}`; }
                } catch (error) { if (error instanceof RequestTimeoutError) { throw error; } /* Non-JSON server errors still have a useful HTTP status. */ }
                throw new Error(message);
            }
            const data = await response.json();
            if (!Array.isArray(data)) { throw new Error('Invalid server response: expected an array'); }
            return data;
        };
        const result = await Promise.race([fetchData(), deadline]);
        entry.consumers.forEach(c => c.resolve(result));
    } catch (error) {
        entry.consumers.forEach(c => c.reject(error instanceof Error ? error : new Error('Request failed')));
    } finally {
        clearTimeout(timer);
        clearTimeout(entry.abandon);
        entry.consumers.forEach(c => c.cleanup());
        entry.consumers.clear();
        if (entries.get(entry.url) === entry) { entries.delete(entry.url); }
    }
}
function pump() {
    if (active || !queue.length) { return; }
    const entry = queue.shift();
    if (!entry.consumers.size) {
        clearTimeout(entry.abandon);
        if (entries.get(entry.url) === entry) { entries.delete(entry.url); }
        pump();
        return;
    }
    active += 1;
    void execute(entry).finally(() => { active -= 1; pump(); });
}
export function request<T>(url: string, options: RequestOptions = {}, heavy = true): Promise<T[]> {
    if (options.signal?.aborted) { return Promise.reject(new Error('Request abandoned')); }
    let entry = entries.get(url);
    const fresh = !entry;
    if (!entry) {
        entry = {url, heavy, phase: 'queued', consumers: new Set(), controller: new AbortController()};
        entries.set(url, entry);
    }
    const current = entry;
    clearTimeout(current.abandon);
    const promise = new Promise<T[]>((resolve, reject) => {
        let consumer: Consumer;
        const leave = () => {
            current.consumers.delete(consumer);
            consumer.cleanup();
            reject(new Error('Request abandoned'));
            if (!current.consumers.size) {
                // Permit immediate effect replay to resubscribe before abandoning shared work.
                current.abandon = setTimeout(() => {
                    if (current.consumers.size) { return; }
                    if (entries.get(url) === current) { entries.delete(url); }
                    const index = queue.indexOf(current);
                    if (index >= 0) { queue.splice(index, 1); }
                    current.cancel?.();
                }, 0);
            }
        };
        consumer = {resolve, reject, phase: options.onPhase, cleanup: () => options.signal?.removeEventListener('abort', leave)};
        current.consumers.add(consumer);
        options.signal?.addEventListener('abort', leave, {once: true});
        options.onPhase?.(current.phase);
    });
    if (fresh) {
        if (heavy) { queue.push(current); pump(); } else { void execute(current); }
    }
    return promise;
}
