import React from 'react';
import type {RequestOptions} from './requestQueue';
import {render, unmountComponentAtNode} from 'react-dom';
import {act} from 'react-dom/test-utils';
import {CountStatsChart} from './components/Charts/CountStatsChart';
import {AlertSet} from './components/AlertSet/AlertSet';
import * as labelCopy from './components/Charts/copyLabel';
jest.mock('react-apexcharts', () => jest.fn(() => <div>Chart result</div>));
jest.mock('./components/SuspenseLoader', () => ({SuspenseLoaderInline: () => <div>Loading</div>}));
let container: HTMLDivElement;
beforeEach(() => {
    require('react-apexcharts').mockImplementation(() => <div>Chart result</div>);
    container = document.createElement('div'); document.body.appendChild(container);
});
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
it('keeps category labels in the chart without a separate copy panel', async () => {
    const labels = [`sensor.${'long_entity_name_'.repeat(80)}é`, 'domain.<example>&"'];
    const api = jest.fn().mockResolvedValue(labels.map(type => ({type, cnt: 1})));
    await act(async () => { render(<CountStatsChart title="Entities" api={api}/>, container); });
    const chart = require('react-apexcharts');
    expect(chart.mock.calls[chart.mock.calls.length - 1][0].options.xaxis.categories).toEqual(labels);
    expect(container.querySelector('textarea, details')).toBeNull();
});
it('copies full chart labels by click and keyboard, without overriding a manual text selection', async () => {
    const labels = ['sensor.full_original_label_é<&>', 'sensor.second'];
    const chart = require('react-apexcharts');
    chart.mockImplementation(() => <svg><text className="apexcharts-yaxis-label"><tspan>sensor.full...</tspan><title>{labels[0]}</title></text></svg>);
    const copy = jest.spyOn(labelCopy, 'copyLabel').mockResolvedValue(true);
    try {
        await act(async () => { render(<CountStatsChart title="Entities" api={async () => labels.map(type => ({type, cnt: 1}))}/>, container); });
        const events = chart.mock.calls[chart.mock.calls.length - 1][0].options.chart.events;
        events.mounted({el: container});
        const label = container.querySelector('.apexcharts-yaxis-label');
        expect(label.getAttribute('role')).toBe('button');
        expect(label.getAttribute('tabindex')).toBe('0');
        expect(label.getAttribute('aria-label')).toBe(`Copy ${labels[0]}`);
        await act(async () => { events.xAxisLabelClick(null, null, {labelIndex: 1}); });
        expect(copy).toHaveBeenLastCalledWith(labels[1]);
        expect(container.textContent).toContain('Category label copied');
        for (const key of ['Enter', ' ']) {
            await act(async () => { label.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true})); });
            expect(copy).toHaveBeenLastCalledWith(labels[0]);
        }
        const range = document.createRange();
        range.selectNodeContents(label.querySelector('tspan'));
        window.getSelection().addRange(range);
        await act(async () => { events.xAxisLabelClick(null, null, {labelIndex: 1}); });
        expect(copy).toHaveBeenCalledTimes(3);
    } finally {
        window.getSelection().removeAllRanges();
        copy.mockRestore();
    }
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
it('loads full-history attributes by default, with no sampling selector', async () => {
    const {AttributeSizeChart} = require('./components/Charts/AttributeSizeChart');
    const client = require('./apiClient').default;
    const recent = jest.spyOn(client.states, 'countRecentAttributesSize').mockResolvedValue([]);
    const exact = jest.spyOn(client.states, 'countAttributesSize').mockResolvedValue([{type: 'exact', cnt: 0.04}]);
    await act(async () => { render(<AttributeSizeChart/>, container); });
    expect(recent).not.toHaveBeenCalled();
    expect(exact).toHaveBeenCalledTimes(1);
    expect(container.querySelector('select')).toBeNull();
    const chart = require('react-apexcharts');
    expect(chart.mock.calls[chart.mock.calls.length - 1][0].options.xaxis.categories).toEqual(['exact']);
    expect(chart.mock.calls[chart.mock.calls.length - 1][0].options.dataLabels.formatter(0.04)).toBe('40.96 KiB');
    expect(chart.mock.calls[chart.mock.calls.length - 1][0].options.xaxis.labels.formatter('0.005')).toBe('5.12 KiB');
    expect(chart.mock.calls[chart.mock.calls.length - 1][0].options.tooltip.y.formatter(0.04)).toBe('40.96 KiB');
    act(() => { unmountComponentAtNode(container); });
    expect((exact.mock.calls[0][0] as RequestOptions).signal.aborted).toBe(true);
    recent.mockRestore(); exact.mockRestore();
});
