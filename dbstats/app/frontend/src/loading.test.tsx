import React from 'react';
import {render, unmountComponentAtNode} from 'react-dom';
import {act} from 'react-dom/test-utils';
import {CountStatsChart} from './components/Charts/CountStatsChart';
import {AlertSet} from './components/AlertSet/AlertSet';
jest.mock('react-apexcharts', () => () => <div>Chart result</div>);
jest.mock('./components/SuspenseLoader', () => ({SuspenseLoaderInline: () => <div>Loading</div>}));
let container: HTMLDivElement;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => { unmountComponentAtNode(container); }); container.remove(); });
it.each(['chart', 'alerts'])('loads %s once per mount', async kind => {
    const api = jest.fn().mockResolvedValue([]);
    await act(async () => { render(kind === 'chart' ? <CountStatsChart title="Count" api={api}/> : <AlertSet api={api}/>, container); });
    expect(api).toHaveBeenCalledTimes(1);
});
it('renders empty, error with retry, and successful chart states', async () => {
    const api = jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Server unavailable')).mockResolvedValue([{type: 'states', cnt: 1}]);
    await act(async () => { render(<CountStatsChart title="Count" api={api}/>, container); });
    expect(container.textContent).toContain('No data');
    act(() => { unmountComponentAtNode(container); });
    await act(async () => { render(<CountStatsChart title="Count" api={api}/>, container); });
    expect(container.textContent).toContain('Server unavailable');
    expect(container.textContent).not.toContain('Loading');
    await act(async () => { container.querySelector('button').click(); });
    expect(container.textContent).toContain('Chart result');
});
it('renders timeout as terminal and stops elapsed updates', async () => {
    jest.useFakeTimers();
    const {request, REQUEST_TIMEOUT_MS} = require('./requestQueue');
    global.fetch = jest.fn(() => new Promise(() => {}));
    const api = options => request('/component-timeout', options);
    await act(async () => { render(<CountStatsChart title="Count" api={api}/>, container); });
    await act(async () => { jest.advanceTimersByTime(REQUEST_TIMEOUT_MS); });
    expect(container.textContent).toContain('timed out');
    expect(container.textContent).not.toContain('Loading');
    const settled = container.textContent;
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(container.textContent).toBe(settled);
    jest.useRealTimers();
});
it('exposes complete category labels for manual copying outside the SVG chart', async () => {
    const labels = [`sensor.${'long_entity_name_'.repeat(80)}é`, 'domain.<example>&"'];
    const api = jest.fn().mockResolvedValue(labels.map(type => ({type, cnt: 1})));
    await act(async () => { render(<CountStatsChart title="Entities" api={api}/>, container); });
    const field = container.querySelector('textarea');
    expect(field.getAttribute('aria-label')).toBe('Entities: full category labels');
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(labels.join('\n'));
    expect(field.closest('details').open).toBe(false);
    field.select();
    expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(labels.join('\n'));
});
it('mounts eight charts plus alerts with nine logical calls', async () => {
    const apis = Array.from({length: 9}, () => jest.fn().mockResolvedValue([]));
    await act(async () => { render(<>{apis.slice(0, 8).map((api, i) => <CountStatsChart key={i} title="Count" api={api}/>)}<AlertSet api={apis[8]}/></>, container); });
    apis.forEach(api => expect(api).toHaveBeenCalledTimes(1));
});
it('ignores a late result after unmount', async () => {
    let finish;
    const api = jest.fn(() => new Promise<any[]>(resolve => { finish = resolve; }));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { render(<CountStatsChart title="Count" api={api}/>, container); });
    act(() => { unmountComponentAtNode(container); });
    await act(async () => { finish([{type: 'late', cnt: 1}]); });
    expect(container.textContent).toBe('');
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
});
it('retains successful charts, shows server timeout, advances queue and retries', async () => {
    const {request} = require('./requestQueue');
    const rows = [{type: 'fixture', cnt: 42}];
    global.fetch = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>rows})
        .mockResolvedValueOnce({ok:false,status:408,json:async()=>({code:'QUERY_TIMEOUT',metricId:'Fixture.rows'})})
        .mockResolvedValue({ok:true,json:async()=>rows});
    const apis = ['/retained','/server-timeout','/following'].map(url => options => request(url, options));
    await act(async () => { render(<>{apis.map((api,i)=><CountStatsChart key={i} title={`Fixture ${i}`} api={api}/>)}</>,container); });
    expect(container.textContent).toContain('timed out');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.textContent.match(/Chart result/g)).toHaveLength(2);
    await act(async () => { container.querySelector('button').click(); });
    expect(container.textContent.match(/Chart result/g)).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(4);
});
