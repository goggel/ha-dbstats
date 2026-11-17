import type {FC} from "react";
import {useRequest} from "../../useRequest";
import type {RequestOptions} from "../../requestQueue";
import * as React from "react";
import Chart from "react-apexcharts";
import {Alert, Box, Button, Snackbar} from "@mui/material";
import {SuspenseLoaderInline} from "../SuspenseLoader";
import type {ICountStats} from "@dbstats/shared/src/stats";
import type {ApexOptions} from "apexcharts";
import colors from "./colors";
import {copyLabel} from './copyLabel';
import {sizeFormatter} from './sizeFormat';

type CountStatesChartProps = {
    title: string,
    api: (options?: RequestOptions) => Promise<Array<ICountStats>>,
    sizeInMiB?: boolean,
}

function thousandFormatter(value: string): string {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (num < 1000) {
        return num.toString();
    }
    return num.toLocaleString('en-us');
}

function enableLabelCopy(chart: {el: Element}) {
    chart.el.querySelectorAll('.apexcharts-yaxis-label').forEach((label, index) => {
        label.setAttribute('tabindex', '0');
        label.setAttribute('role', 'button');
        label.setAttribute('data-category-index', String(index));
        label.setAttribute('aria-label', `Copy ${label.querySelector('title')?.textContent ?? label.textContent}`);
    });
}

export const CountStatsChart: FC<CountStatesChartProps> = ({title, api, sizeInMiB = false}) => {

    const {state: status, data, error, elapsed, retry} = useRequest(api);
    const [copyMessage, setCopyMessage] = React.useState('');
    const copyCategory = async (index: number) => {
        if (!data[index]) { return; }
        const copied = await copyLabel(data[index].type);
        setCopyMessage(copied ? 'Category label copied' : 'Copy unavailable. Select the label and use your device’s Copy command.');
    };
    if (status === 'error' || status === 'timeout') {
        return <Alert severity="error">{title}: {error}<Button onClick={retry}>Retry</Button></Alert>;
    }
    if (status === 'queued' || status === 'loading') {
        return <div role="status">{title}: {status} ({elapsed}s)<SuspenseLoaderInline success={false}/></div>;
    }
    if (status === 'empty') { return <Alert severity="info">{title}: No data</Alert>; }
    const formatValue = sizeInMiB ? sizeFormatter(Math.max(...data.map(item => Number(item.cnt)))) : null;
            const state: { options: ApexOptions, series: ApexAxisChartSeries } = {
                options: {
                    colors: colors(data.length),
                    legend: {
                        show: false,
                    },
                    title: {text: title, align: "center"},
                    chart: {
                        events: {
                            mounted: enableLabelCopy,
                            updated: enableLabelCopy,
                            xAxisLabelClick: (_event, _chart, options) => {
                                if (window.getSelection()?.isCollapsed !== false) { void copyCategory(options.labelIndex); }
                            },
                        },
                    },
                    plotOptions: {
                        bar: {
                            distributed: true,
                            borderRadius: 4,
                            borderRadiusApplication: 'end',
                            horizontal: true,
                        }
                    }, dataLabels: {
                        style: {fontSize: "14"},
                        ...(formatValue ? {formatter: value => formatValue(Number(value))} : {}),
                    },
                    ...(formatValue ? {tooltip: {y: {formatter: formatValue}}} : {}),
                    yaxis: {
                        floating: false,
                        labels: {
                            maxWidth: 700,
                            align: 'right',
                            style: {
                                fontSize: "14",
                            },
                        },
                    },
                    xaxis: {
                        categories: data.map(item => item.type),
                        labels: {
                            formatter: value => formatValue ? formatValue(Number(value)) : thousandFormatter(value),
                            trim: false,
                            style: {
                                fontSize: "14",
                            },
                        },
                    }
                },
                series: [
                    {
                        name: "",
                        data: data.map(item => item.cnt)
                    }
                ]
            };
    return (
        <Box sx={{
            // ApexCharts disables selection on its canvas. Keep the visible labels selectable.
            '& .apexcharts-yaxis-label, & .apexcharts-yaxis-label tspan, & .apexcharts-legend-text': {
                userSelect: 'text',
                WebkitUserSelect: 'text',
                cursor: 'copy',
            },
            '& .apexcharts-yaxis-label:focus-visible': {outline: '2px solid currentColor'},
        }} onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') { return; }
            const label = (event.target as Element).closest('.apexcharts-yaxis-label');
            if (!label) { return; }
            event.preventDefault();
            void copyCategory(Number(label.getAttribute('data-category-index')));
        }}>
            <Chart style={{marginTop: 25}}
                   options={state.options}
                   series={state.series}
                   type="bar"
                   width="100%"
                   height={state.series[0].data.length * 45}
            />
            <Snackbar open={!!copyMessage} message={copyMessage} autoHideDuration={3000} onClose={() => setCopyMessage('')}/>
        </Box>
    );
}
