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

    const placementFailure = () =>
        details("TERMINATED", {
            state_message:
                "Unexpected failure during launch. databricks_error_message: Timeout while placing nodes.",
        });

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

    it("fails fast when start() is rejected and the cluster stays stopped", async () => {
        // start() fails and the re-check shows the cluster still stopped, so the
        // original (actionable) error surfaces immediately rather than being
        // masked or retried — retrying the same rejected call can't help.
        whenGet().thenResolve(details("TERMINATED"), details("TERMINATED"));
        whenStart().thenReject(new Error("permission denied"));

        const startPromise = startCluster(instance(mockedClient), clusterId);
        const rejection = assert.rejects(startPromise, (e: Error) =>
            /permission denied/.test(e.message)
        );
        await fakeTimer.runToLastAsync();
        await rejection;

        verifyStarted(1);
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

    it("re-starts after a transient post-start terminal failure, then reaches RUNNING", async () => {
        whenGet().thenResolve(
            details("TERMINATED"),
            placementFailure(),
            details("PENDING"),
            details("RUNNING")
        );
        whenStart().thenResolve({});

        const startPromise = startCluster(instance(mockedClient), clusterId);
        await fakeTimer.runAllAsync();
        await startPromise;

        // start() issued once per attempt: the failed one plus the recovery.
        verifyStarted(2);
    });

    it("retries a persistent terminal failure up to the max, then surfaces its reason", async () => {
        // Retry is not gated on the reason string, so even a deterministic
        // failure is re-attempted (best-effort warm-up) before surfacing.
        whenGet().thenResolve(
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
        await fakeTimer.runAllAsync();
        await rejection;

        verifyStarted(3);
    });

    it("stops re-starting once the deadline is exhausted by backoff", async () => {
        // A short timeout: after the first failure the jittered backoff (>=10s)
        // is capped to the remaining deadline and consumes it, so the loop must
        // not issue a second start().
        whenGet().thenResolve(placementFailure());
        whenStart().thenResolve({});

        const startPromise = startCluster(
            instance(mockedClient),
            clusterId,
            new Time(5, TimeUnits.seconds)
        );
        const rejection = assert.rejects(
            startPromise,
            (e: Error) =>
                e instanceof ClusterStartError &&
                /Timeout while placing nodes/.test(e.message)
        );
        await fakeTimer.runAllAsync();
        await rejection;

        verifyStarted(1);
    });

    it("re-checks through a start race on a retry, then reaches RUNNING", async () => {
        // A post-start terminal triggers a retry; the retry's start() races a
        // sibling and throws, the re-check finds it coming up (PENDING), and the
        // poll reaches RUNNING.
        whenGet().thenResolve(
            details("TERMINATED"),
            placementFailure(),
            details("PENDING"),
            details("RUNNING")
        );
        whenStart()
            .thenResolve({})
            .thenReject(
                new Error(
                    `Cluster ${clusterId} is in unexpected state Pending.`
                )
            );

        const startPromise = startCluster(instance(mockedClient), clusterId);
        await fakeTimer.runAllAsync();
        await startPromise;

        verifyStarted(2);
    });

    it("surfaces a stuck-PENDING poll timeout as-is, without retrying", async () => {
        // A cluster that never leaves PENDING is out of scope: the poll times
        // out (a non-ClusterStartError), which must propagate without a re-start.
        whenGet().thenResolve(details("TERMINATED"), details("PENDING"));
        whenStart().thenResolve({});

        const startPromise = startCluster(
            instance(mockedClient),
            clusterId,
            new Time(30, TimeUnits.seconds)
        );
        const rejection = assert.rejects(
            startPromise,
            (e: Error) => !(e instanceof ClusterStartError)
        );
        await fakeTimer.runAllAsync();
        await rejection;

        // One start(), then the poll timed out — no retry.
        verifyStarted(1);
    });

    it("rejects without starting when the deadline is already spent on entry", async () => {
        // Degenerate timeout: the loop's first guard trips before any start(),
        // so the fallback error surfaces rather than throwing an undefined.
        whenGet().thenResolve(details("TERMINATED"));

        const startPromise = startCluster(
            instance(mockedClient),
            clusterId,
            new Time(0, TimeUnits.milliseconds)
        );
        const rejection = assert.rejects(
            startPromise,
            (e: Error) =>
                e instanceof ClusterStartError &&
                /did not reach RUNNING/.test(e.message)
        );
        await fakeTimer.runAllAsync();
        await rejection;

        verifyStarted(0);
    });
});
