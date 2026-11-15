import type {IShowAlerts} from "@dbstats/shared/src/stats";
import type {FC} from "react";
import {useRequest} from "../../useRequest";
import type {RequestOptions} from "../../requestQueue";
import * as React from "react";
import {Alert, Button} from "@mui/material";
import {SuspenseLoaderInline} from "../SuspenseLoader";

type AlertSetProps = {
    api: (options?: RequestOptions) => Promise<Array< IShowAlerts >>,
}


export const AlertSet: FC<AlertSetProps> = ({api}) => {

    const {state, data, error, elapsed, retry} = useRequest(api);
    if (state === 'error' || state === 'timeout') {
        return <Alert severity="error">{error}<Button onClick={retry}>Retry</Button></Alert>;
    }
    if (state === 'queued' || state === 'loading') {
        return <div role="status">Alerts: {state} ({elapsed}s)<SuspenseLoaderInline success={false}/></div>;
    }
    if (state === 'empty') { return <Alert severity="info">No alerts</Alert>; }
    return (
        <>
                {
                    data.map((el, index) => (<Alert style={{marginTop: 15}} key={index} severity={el.type}>{el.text}</Alert>))
                }
        </>
    );
}
