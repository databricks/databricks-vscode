import {expect} from "chai";
import {mock, instance, when} from "ts-mockito";
import {install, Clock} from "@sinonjs/fake-timers";
import {JobRunStatus} from "./JobRunStatus";
import {AuthProvider} from "../../configuration/auth/AuthProvider";

// These tests pin the CLI-output contract that JobRunStatus.parseId depends on.
// The run id is scraped from the run URL the `databricks bundle run` CLI prints
// to the terminal. When the CLI changed the URL format from the legacy
// "#job/<id>/run/<id>" fragment to the modern "/jobs/<id>/runs/<id>?o=.." path
// (databricks/cli), the old singular-"/run/" regex silently stopped matching and
// the extension showed a permanent false "Timeout while fetching run status" for
// jobs that actually succeeded. These tests guard against that class of drift.
describe("JobRunStatus.parseId", () => {
    let clock: Clock;
    let authProvider: AuthProvider;

    beforeEach(() => {
        // The BundleRunStatus base class arms a 60s "no run id -> timeout" timer
        // in its constructor; fake timers keep it from leaking past the test.
        clock = install();
        authProvider = mock<AuthProvider>();
        // parseId calls startPolling() on a successful match, which awaits
        // getWorkspaceClient(). Return a never-resolving promise so no real
        // network happens and polling never advances runState past what we
        // assert. startPolling is wrapped in @onError({throw:false}), so this
        // can never reject into the test.
        when(authProvider.getWorkspaceClient()).thenReturn(
            new Promise(() => {}) as any
        );
    });

    afterEach(() => {
        clock.uninstall();
    });

    function newStatus() {
        return new JobRunStatus(instance(authProvider));
    }

    it("extracts the run id from the modern '/jobs/<id>/runs/<id>' URL", () => {
        const status = newStatus();
        status.parseId(
            "Run URL: https://adb-123.azuredatabricks.net/jobs/600749519600807/runs/931844287868435?o=2059256957719798"
        );
        expect(status.runId).to.equal("931844287868435");
    });

    it("extracts the run id from the 'Run available at ...' modern URL", () => {
        const status = newStatus();
        status.parseId(
            "Run available at https://adb-123.azuredatabricks.net/jobs/600749519600807/runs/931844287868435?o=2059256957719798"
        );
        expect(status.runId).to.equal("931844287868435");
    });

    it("extracts the run id from the legacy '#job/<id>/run/<id>' fragment URL", () => {
        const status = newStatus();
        status.parseId(
            "https://adb-123.azuredatabricks.net/?o=2059256957719798#job/600749519600807/run/931844287868435"
        );
        expect(status.runId).to.equal("931844287868435");
    });

    it("does not capture the job id from a '/jobs/<id>' URL without a run segment", () => {
        const status = newStatus();
        status.parseId(
            "https://adb-123.azuredatabricks.net/jobs/600749519600807"
        );
        expect(status.runId).to.be.undefined;
    });

    it("does not set an empty run id when a chunk splits right after '/runs/'", () => {
        // The CLI output arrives in stdout chunks. A split immediately after
        // "/runs/" must not produce an empty capture (parseInt("") === NaN).
        const status = newStatus();
        status.parseId(
            "Run URL: https://adb-123.azuredatabricks.net/jobs/1/runs/"
        );
        expect(status.runId).to.be.undefined;
    });

    it("ignores output that contains no run URL", () => {
        const status = newStatus();
        status.parseId("Deploying resources...");
        expect(status.runId).to.be.undefined;
    });

    it("keeps the first run id it sees and ignores later output", () => {
        const status = newStatus();
        status.parseId(
            "Run URL: https://adb-123.azuredatabricks.net/jobs/1/runs/111"
        );
        expect(status.runId).to.equal("111");
        status.parseId(
            "Run URL: https://adb-123.azuredatabricks.net/jobs/2/runs/222"
        );
        expect(status.runId).to.equal("111");
    });
});
