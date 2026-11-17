import {act} from 'react-dom/test-utils';
import {render, unmountComponentAtNode} from 'react-dom';
import apiClient from './apiClient';
import {TableStorageOverview} from './components/Charts/TableStorageOverview';
import {ShortTermOverview} from './components/Charts/ShortTermOverview';

let container: HTMLDivElement;
const end = Date.UTC(2026,10,17,12)/1000;
const tables = Array.from({length:35}, (_,i)=>({schema:'main',name: i===0 ? 'statistics_short_term' : `table_${i}`,dataBytes:1024,indexBytes:1024,totalBytes:2048,estimatedRows:null}));
const base = {retainedRows:288,firstTs:end-86400,lastTs:end-300,observed:288,expected:288,missing:0,coverage:100};
const summary = {generatedAt:end,window:'day',startTs:end-86400,endTs:end,totalRows:576,statisticCount:2,oldestTs:end-86400,newestTs:end-300,
    series:[{...base,metadataId:2,statisticId:'sensor.gaps',observed:287,missing:1,coverage:287/288*100,status:'gaps'}, {...base,metadataId:1,statisticId:'sensor.complete',status:'complete'}]};
beforeEach(()=>{
    container=document.createElement('div');document.body.appendChild(container);
    jest.spyOn(apiClient.system,'getTableStorage').mockResolvedValue(tables);
    jest.spyOn(apiClient.statistic,'getShortOverview').mockImplementation(async window=>[{...summary,window}] as any);
    jest.spyOn(apiClient.statistic,'getShortDays').mockResolvedValue([{dayTs:end-86400,observed:287,expected:288,missing:1,coverage:287/288*100}]);
});
afterEach(()=>{act(()=>{unmountComponentAtNode(container);});container.remove();jest.restoreAllMocks();});

it('lists every table with sizes and indexes, and searches beyond the first page without changing totals', async()=>{
    await act(async()=>{render(<TableStorageOverview/>,container);});
    expect(container.textContent).toContain('Storage by table');
    expect(container.textContent).toContain('1–25 of 35');
    expect(container.textContent).toContain('70 KiB');
    const input=container.querySelector('input');
    await act(async()=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'table_34');
        input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    expect(container.textContent).toContain('table_34');
    expect(container.textContent).not.toContain('table_33');
    expect(container.textContent).toContain('70 KiB');
    expect(container.textContent).toContain('1–1 of 1');
});
it('shows unavailable allocations explicitly without inventing zero sizes', async()=>{
    (apiClient.system.getTableStorage as jest.Mock).mockResolvedValue([{...tables[0],dataBytes:null,indexBytes:null,totalBytes:null}]);
    await act(async()=>{render(<TableStorageOverview/>,container);});
    expect(container.textContent).toContain('Unavailable');
    expect(container.textContent).toContain('Some table sizes are unavailable');
    expect(container.textContent).not.toContain('0 B');
});
it('collapses healthy series and fetches daily coverage only after selecting a statistic', async()=>{
    await act(async()=>{render(<ShortTermOverview/>,container);});
    expect(container.textContent).toContain('576');
    expect(container.textContent).toContain('Statistics with complete coverage for this period: 1');
    expect(container.textContent).toContain('sensor.gaps');
    expect(container.textContent).not.toContain('sensor.complete');
    expect(apiClient.statistic.getShortDays).not.toHaveBeenCalled();
    await act(async()=>{(container.querySelector('[aria-label="Daily coverage for sensor.gaps"]') as HTMLElement).click();});
    expect(apiClient.statistic.getShortDays).toHaveBeenCalledWith(2,expect.objectContaining({signal:expect.any(AbortSignal)}));
    expect(container.textContent).toContain('Daily coverage: sensor.gaps');
    expect(container.textContent).toContain('287');
    const all=Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Show all statistics');
    await act(async()=>{all.click();});
    expect(container.textContent).toContain('sensor.complete');
});
it('changes the exact coverage window and cancels the previous subscription', async()=>{
    await act(async()=>{render(<ShortTermOverview/>,container);});
    const signal=(apiClient.statistic.getShortOverview as jest.Mock).mock.calls[0][1].signal;
    await act(async()=>{(container.querySelector('[aria-haspopup="listbox"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));});
    await act(async()=>{(document.querySelector('[data-value="week"]') as HTMLElement).click();});
    expect(apiClient.statistic.getShortOverview).toHaveBeenLastCalledWith('week',expect.any(Object));
    expect(signal.aborted).toBe(true);
});
it('shows terminal errors and retries the overview successfully', async()=>{
    (apiClient.statistic.getShortOverview as jest.Mock).mockRejectedValueOnce(new Error('Database unavailable'));
    await act(async()=>{render(<ShortTermOverview/>,container);});
    expect(container.textContent).toContain('Database unavailable');
    await act(async()=>{Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Retry').click();});
    expect(container.textContent).toContain('sensor.gaps');
});
it('keeps newly compiled statistics neutral until completed buckets can be assessed', async()=>{
    (apiClient.statistic.getShortOverview as jest.Mock).mockResolvedValue([{...summary,totalRows:1,statisticCount:1,
        series:[{...base,metadataId:3,statisticId:'sensor.new',firstTs:end+300,lastTs:end+300,observed:0,expected:0,missing:0,coverage:null,status:'pending'}]}]);
    await act(async()=>{render(<ShortTermOverview/>,container);});
    expect(container.textContent).toContain('Statistics without completed buckets to assess yet: 1');
    expect(container.textContent).toContain('No coverage exceptions found');
    await act(async()=>{Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Show all statistics').click();});
    expect(container.textContent).toContain('No completed buckets yet');
});
