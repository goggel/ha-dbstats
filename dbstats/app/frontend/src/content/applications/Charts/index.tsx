import {
    Card,
    useTheme, Alert, Grid, CardContent, CardHeader, Link, Stack
} from '@mui/material';
import * as React from "react";
import apiClient from "../../../apiClient";
import {Helmet} from "react-helmet-async";
import PageTitleWrapper from "../../../components/PageTitleWrapper";
import PageTitle from "../../../components/PageTitle";
import Container from "@mui/material/Container";
import Footer from "../../../components/Footer";
import {CountStatsChart} from "../../../components/Charts/CountStatsChart";
import {AttributeSizeChart} from "../../../components/Charts/AttributeSizeChart";
import {AlertSet} from "../../../components/AlertSet/AlertSet";
import {TableStorageOverview} from '../../../components/Charts/TableStorageOverview';
import {ShortTermOverview} from '../../../components/Charts/ShortTermOverview';


function DatabaseStats() {
    return (
        <>
            <Helmet>
                <title>Database stats</title>
            </Helmet>
            <PageTitleWrapper>
                <PageTitle
                    heading="Database stats"
                    subHeading="Different database stats"
                />
            </PageTitleWrapper>
            <Container maxWidth="lg">
                <Grid
                    container
                    direction="row"
                    justifyContent="center"
                    alignItems="stretch"
                >
                    <Grid item xs={12}>
                        <Card style={{marginTop: 25}}>
                            <CardHeader title="Generic database stats"></CardHeader>
                            <CardContent>
                                <Stack spacing={2}>
                                    <Alert severity="info">If you are unfamiliar with HA tables, you can read about them <Link href="https://data.home-assistant.io/docs/data">here</Link></Alert>
                                    <Alert severity="info">Entity charts show at most 20 categories over all recorded history. The storage overview lists every user table. Row counts are database estimates where available.</Alert>
                                    <AlertSet api={apiClient.system.getDbAlerts}></AlertSet>
                                </Stack>
                                <TableStorageOverview/>
                            </CardContent></Card>
                        <Card style={{marginTop: 25}}>
                            <CardHeader title="Short-term statistics: storage and coverage"/>
                            <CardContent><ShortTermOverview/></CardContent>
                        </Card>
                        <Card style={{marginTop: 25}}>
                            <CardHeader title="Events"></CardHeader>
                            <CardContent>
                                <CountStatsChart api={apiClient.events.countEventTypes}
                                                 title="Count event types"/>
                                <CountStatsChart api={apiClient.events.countEventsByDomain}
                                                 title="Count events by domain"/>
                            </CardContent></Card>
                        <Card style={{marginTop: 25}}>
                            <CardHeader title="States"></CardHeader>
                            <CardContent>
                                <CountStatsChart api={apiClient.states.countStates}
                                                 title="Count states"/>
                            </CardContent></Card>
                        <Card style={{marginTop: 25}}>
                            <CardHeader title="Attributes"></CardHeader>
                            <CardContent>
                                <AttributeSizeChart/>
                            </CardContent></Card>
                        <Card style={{marginTop: 25}}>
                            <CardHeader title="Long term statistics"></CardHeader>
                            <CardContent>
                                <CountStatsChart api={apiClient.statistic.countLong}
                                                 title="Count long term statistics"/>
                            </CardContent></Card>
                    </Grid>
                </Grid>
            </Container>
            <Footer/>
        </>
    );
}

export default DatabaseStats;
