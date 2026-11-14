import {request, REQUEST_TIMEOUT_MS, RequestTimeoutError} from './requestQueue';
const flush = async () => { for (let i = 0; i < 15; i += 1) { await Promise.resolve(); } };
const ok = (data = []) => ({ok: true, json: async () => data});
beforeEach(() => { jest.useFakeTimers(); global.fetch = jest.fn(); });
afterEach(() => { jest.useRealTimers(); });
it('shares a fetch and one leaving subscriber does not cancel another', async () => {
    let finish;
    (fetch as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const first = request('/shared', {signal: controller.signal}).catch(e => e.message);
    const second = request('/shared');
    controller.abort();
    finish(ok());
    await expect(second).resolves.toEqual([]);
    await first;
    expect(fetch).toHaveBeenCalledTimes(1);
});
it('times out, releases the lane, and retries with a new fetch', async () => {
    (fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(ok());
    const first = request('/timeout').catch(e => e);
    const next = request('/next');
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    await expect(first).resolves.toBeInstanceOf(RequestTimeoutError);
    await expect(next).resolves.toEqual([]);
    await expect(request('/timeout')).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
});
it('removes unstarted work and cleans up abandoned active requests', async () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const a = new AbortController(); const b = new AbortController();
    const first = request('/abandon', {signal: a.signal}).catch(() => {});
    const second = request('/unstarted', {signal: b.signal}).catch(() => {});
    b.abort(); a.abort(); jest.advanceTimersByTime(0); await flush();
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});
it('keeps heavy requests serial while metadata proceeds independently', async () => {
    let finish;
    (fetch as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(ok());
    const first = request('/heavy'); const next = request('/heavy2');
    await expect(request('/metadata-fixture', {}, false)).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    finish(ok()); await first; await next;
    expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([400, 500])('rejects HTTP %s and malformed JSON safely', async status => {
    (fetch as jest.Mock).mockResolvedValueOnce({ok: false, status, json: async () => { throw new Error('invalid'); }}).mockResolvedValueOnce({ok: true, json: async () => { throw new Error('invalid JSON'); }});
    await expect(request(`/error${status}`)).rejects.toThrow(`HTTP ${status}`);
    await expect(request(`/json${status}`)).rejects.toThrow('invalid JSON');
});
it('keeps immediate effect replay on the same in-flight fetch', async () => {
    let finish;
    (fetch as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const old = request('/replay', {signal: controller.signal}).catch(() => {});
    controller.abort();
    const replay = request('/replay');
    jest.advanceTimersByTime(0);
    finish(ok()); await old; await replay;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});
it('uses real RequestInit options and preserves Nest messages', async () => {
    (fetch as jest.Mock).mockResolvedValue({ok: false, status: 400, json: async () => ({message: ['invalid request', 'try again']})});
    await expect(request('/nest')).rejects.toThrow('invalid request; try again');
    const init = (fetch as jest.Mock).mock.calls[0][1];
    expect(init).toMatchObject({credentials: 'same-origin', cache: 'no-cache', mode: 'cors'});
    expect(init.headers).toEqual({'Content-Type': 'application/json'});
});
it('does not start an unsubscribed queued request when the lane frees before cleanup', async () => {
    let finish;
    (fetch as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = request('/race-active');
    const controller = new AbortController();
    const second = request('/race-queued', {signal: controller.signal}).catch(() => {});
    controller.abort(); finish(ok());
    await first; await second; await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});
it.each(['', '209999', '300001', 'NaN', '210000.5'])('rejects invalid browser timeout %s', value => {
    const previous = process.env.REACT_APP_REQUEST_TIMEOUT_MS;
    process.env.REACT_APP_REQUEST_TIMEOUT_MS = value;
    try { expect(() => jest.isolateModules(() => require('./requestQueue'))).toThrow('Invalid REACT_APP_REQUEST_TIMEOUT_MS'); }
    finally { if (previous === undefined) { delete process.env.REACT_APP_REQUEST_TIMEOUT_MS; } else { process.env.REACT_APP_REQUEST_TIMEOUT_MS = previous; } }
});
