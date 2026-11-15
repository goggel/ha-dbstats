import type {FC} from "react";
import {useRequest} from "../../useRequest";
import type {RequestOptions} from "../../requestQueue";
import * as React from "react";
import Chart from "react-apexcharts";
import {Alert, Button} from "@mui/material";
import {SuspenseLoaderInline} from "../SuspenseLoader";
import type {ICountStats} from "@dbstats/shared/src/stats";
import type {ApexOptions} from "apexcharts";
import colors from "./colors";

type CountStatesChartProps = {
    title: string,
    api: (options?: RequestOptions) => Promise<Array<ICountStats>>,
}

function thousandFormatter(value: string): string {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (num < 1000) {
        return num.toString();
    }
    return num.toLocaleString('en-us');
}

export const CountStatsChart: FC<CountStatesChartProps> = ({title, api}) => {

    const {state: status, data, error, elapsed, retry} = useRequest(api);
    if (status === 'error' || status === 'timeout') {
        return <Alert severity="error">{title}: {error}<Button onClick={retry}>Retry</Button></Alert>;
    }
    if (status === 'queued' || status === 'loading') {
        return <div role="status">{title}: {status} ({elapsed}s)<SuspenseLoaderInline success={false}/></div>;
    }
    if (status === 'empty') { return <Alert severity="info">{title}: No data</Alert>; }
            const state: { options: ApexOptions, series: ApexAxisChartSeries } = {
                options: {
                    colors: colors(data.length),
                    legend: {
                        show: false,
                    },
                    title: {text: title, align: "center"},
                    chart: {},
                    plotOptions: {
                        bar: {
                            distributed: true,
                            borderRadius: 4,
                            borderRadiusApplication: 'end',
                            horizontal: true,
                        }
                    }, dataLabels: {
                        style: {fontSize: "14"},
                        //formatter: thousandFormatter,
                    },
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
                            formatter: thousandFormatter,
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
        <Chart style={{marginTop: 25}}
               options={state.options}
               series={state.series}
               type="bar"
               width="100%"
               height={state.series[0].data.length * 45}
        />
    );
}
