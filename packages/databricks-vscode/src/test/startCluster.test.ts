/* eslint-disable @typescript-eslint/naming-convention */

import {
    ApiClient,
    Config,
    Time,
    TimeUnits,
    compute,
} from "@databricks/sdk-experimental";
import * as assert from "node:assert";
import {
    mock,
    when,
    instance,
    anything,
    objectContaining,
    verify,
} from "ts-mockito";
import FakeTimers from "@sinonjs/fake-timers";
import {startCluster, ClusterStartError} from "./startCluster";

describe(__filename, function () {
    this.timeout(new Time(10, TimeUnits.minutes).toMillSeconds().value);

    const clusterId = "test-cluster-id";
    let mockedClient: ApiClient;
    let fakeTimer: FakeTimers.Clock;

    const details = (
        state: compute.State,
        extra: Partial<compute.ClusterDetails> = {}
    ): compute.ClusterDetails =>
        ({cluster_id: clusterId, state, ...extra}) as compute.ClusterDetails;

    const whenGet = () =>
        when(
            mockedClient.request(
                objectContaining({
                    path: "/api/2.1/clusters/get",
                    method: "GET",
                }),
                anything()
            )
        );
    const whenStart = () =>
        when(
            mockedClient.request(
                objectContaining({
                    path: "/api/2.1/clusters/start",
                    method: "POST",
                }),
                anything()
            )
        );
    const verifyStarted = (times: number) =>
        verify(
            mockedClient.request(
                objectContaining({
                    path: "/api/2.1/clusters/start",
                    method: "POST",
                }),
                anything()
            )
        ).times(times);

    beforeEach(() => {
        mockedClient = mock(ApiClient);
        // ClustersService resolves config before each request, so stub it (see
        // sdk-extensions/test/ClusterFixtures) or get() hits a null config.
        const mockedConfig = mock(Config);
        when(mockedConfig.ensureResolved()).thenResolve();
        when(mockedClient.config).thenReturn(instance(mockedConfig));
        fakeTimer = FakeTimers.install({shouldClearNativeTimers: true});
    });

    afterEach(() => {
        fakeTimer.uninstall();
    });

    it("returns without starting when the cluster is already RUNNING", async () => {
        whenGet().thenResolve(details("RUNNING"));

        await startCluster(instance(mockedClient), clusterId);

        verifyStarted(0);
    });

    it("starts a stopped cluster and polls until RUNNING", async () => {
        whenGet().thenResolve(
            details("TERMINATED"),
            details("PENDING"),
            details("RUNNING")
        );
        whenStart().thenResolve({});

        const startPromise = startCluster(instance(mockedClient), clusterId);
        await fakeTimer.runToLastAsync();
        await startPromise;

        verifyStarted(1);
    });

    it("fails fast when the cluster returns to a terminal state after start", async () => {
        whenGet().thenResolve(
            details("TERMINATED"),
            details("TERMINATED", {state_message: "bad spark config"})
        );
        whenStart().thenResolve({});

        const startPromise = startCluster(instance(mockedClient), clusterId);
        const rejection = assert.rejects(
            startPromise,
            (e: Error) =>
                e instanceof ClusterStartError &&
                /bad spark config/.test(e.message)
        );
        await fakeTimer.runToLastAsync();
        await rejection;
    });

    it("tolerates a concurrent start race on the shared cluster", async () => {
        // Initial TERMINATED -> our start() races a sibling and throws -> the
        // re-check finds it already coming up (PENDING) -> RUNNING.
        whenGet().thenResolve(
            details("TERMINATED"),
            details("PENDING"),
            details("RUNNING")
        );
        whenStart().thenReject(
            new Error(`Cluster ${clusterId} is in unexpected state Pending.`)
        );

        const startPromise = startCluster(instance(mockedClient), clusterId);
        await fakeTimer.runToLastAsync();
        await startPromise;

        // The raced start() was attempted, and polling still reached RUNNING.
        verifyStarted(1);
    });

    it("propagates a non-race start error when the cluster stays stopped", async () => {
        // start() fails and the re-check shows the cluster still stopped, so the
        // original (actionable) error surfaces rather than being masked.
        whenGet().thenResolve(details("TERMINATED"), details("TERMINATED"));
        whenStart().thenReject(new Error("permission denied"));

        const startPromise = startCluster(instance(mockedClient), clusterId);
        const rejection = assert.rejects(startPromise, (e: Error) =>
            /permission denied/.test(e.message)
        );
        await fakeTimer.runToLastAsync();
        await rejection;
    });

    it("waits for a TERMINATING cluster to stop, then starts it", async () => {
        whenGet().thenResolve(
            details("TERMINATING"),
            details("TERMINATED"),
            details("RUNNING")
        );
        whenStart().thenResolve({});

        const startPromise = startCluster(instance(mockedClient), clusterId);
        await fakeTimer.runToLastAsync();
        await startPromise;

        verifyStarted(1);
    });

    it("fails fast when the cluster is UNKNOWN after start", async () => {
        whenGet().thenResolve(
            details("TERMINATED"),
            details("UNKNOWN", {state_message: "lost the cluster"})
        );
        whenStart().thenResolve({});

        const startPromise = startCluster(instance(mockedClient), clusterId);
        const rejection = assert.rejects(
            startPromise,
            (e: Error) =>
                e instanceof ClusterStartError &&
                /lost the cluster/.test(e.message)
        );
        await fakeTimer.runToLastAsync();
        await rejection;
    });
});
