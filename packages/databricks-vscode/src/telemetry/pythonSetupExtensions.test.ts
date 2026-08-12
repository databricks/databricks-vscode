// The recorded event keys are transport-prefixed ("event.<field>"), not
// identifiers, so the camelCase rule does not apply to these assertions.
/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from "chai";
import {Telemetry} from ".";
import "./pythonSetupExtensions";

type RecordedEvent = {
    name: string;
    props: Record<string, string>;
    metrics: Record<string, number>;
};

/** A Telemetry backed by a fake reporter that captures sent events. */
function makeTelemetry(level: "all" | "error" | "crash" | "off" = "all") {
    const events: RecordedEvent[] = [];
    const reporter = {
        telemetryLevel: level,
        sendTelemetryEvent: (
            name: string,
            props?: Record<string, string>,
            metrics?: Record<string, number>
        ) => {
            events.push({name, props: props ?? {}, metrics: metrics ?? {}});
        },
        sendTelemetryErrorEvent: () => {},
        sendDangerousTelemetryEvent: () => {},
        sendDangerousTelemetryErrorEvent: () => {},
        dispose: () => Promise.resolve(),
    };
    return {telemetry: new Telemetry(reporter as any), events};
}

describe(__filename, () => {
    it("records an attempt, then its result via the returned reporter", () => {
        const {telemetry, events} = makeTelemetry();

        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "serverless",
            serverlessVersion: "5",
            mode: "default",
            isGreenfield: true,
            trigger: "initial",
        });
        reportResult({
            outcome: "ok",
            envKey: "serverless/serverless-v5",
        });

        expect(events.map((e) => e.name)).to.deep.equal([
            "python_env.setup.attempt",
            "python_env.setup.result",
        ]);
        expect(events[0].props).to.deep.equal({
            "version": "1.0",
            "event.packageManager": "uv",
            "event.targetType": "serverless",
            "event.serverlessVersion": "5",
            "event.mode": "default",
            "event.isGreenfield": "true",
            "event.trigger": "initial",
        });
        expect(events[1].props).to.deep.equal({
            "version": "1.0",
            "event.outcome": "ok",
            "event.envKey": "serverless/serverless-v5",
        });
    });

    it("stamps a duration on the result, measured from the attempt", () => {
        const {telemetry, events} = makeTelemetry();

        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            trigger: "initial",
        });
        reportResult({outcome: "ok"});

        // The CLI's own durationMs is always 0; this must be our own clock.
        expect(events[1].metrics).to.have.property("event.duration");
        expect(events[1].metrics["event.duration"]).to.be.a("number");
        expect(events[1].metrics["event.duration"]).to.be.at.least(0);
        // Duration is a metric, never a property.
        expect(events[1].props).to.not.have.property("event.duration");
    });

    it("omits absent optional fields instead of sending the string 'undefined'", () => {
        const {telemetry, events} = makeTelemetry();

        // A cluster attempt: no serverless version, and a manager for which the
        // greenfield signal is not reportable.
        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "pip",
            targetType: "cluster",
            mode: "constraints-only",
            serverlessVersion: undefined,
            isGreenfield: undefined,
            trigger: "initial",
        });
        // A cancelled run has no phase, error code, env key or disk state.
        reportResult({
            outcome: "cancelled",
            failurePhase: undefined,
            errorCode: undefined,
            envKey: undefined,
            diskMutated: undefined,
        });

        expect(events[0].props).to.deep.equal({
            "version": "1.0",
            "event.packageManager": "pip",
            "event.targetType": "cluster",
            "event.mode": "constraints-only",
            "event.trigger": "initial",
        });
        expect(events[1].props).to.deep.equal({
            "version": "1.0",
            "event.outcome": "cancelled",
        });
        // The failure mode this guards against: recordEvent stringifies an
        // explicit undefined, which would pollute the schema.
        for (const event of events) {
            expect(Object.values(event.props)).to.not.contain("undefined");
        }
    });

    it("records a full failure report", () => {
        const {telemetry, events} = makeTelemetry();

        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            isGreenfield: false,
            trigger: "initial",
        });
        reportResult({
            outcome: "failed",
            failurePhase: "provision",
            errorCode: "E_PROVISION",
            envKey: "dbr/15.4.x-scala2.12",
            diskMutated: true,
        });

        expect(events[1].props).to.deep.equal({
            "version": "1.0",
            "event.outcome": "failed",
            "event.failurePhase": "provision",
            "event.errorCode": "E_PROVISION",
            "event.envKey": "dbr/15.4.x-scala2.12",
            "event.diskMutated": "true",
        });
    });

    it("reports at most one result per attempt", () => {
        const {telemetry, events} = makeTelemetry();

        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            trigger: "initial",
        });
        reportResult({outcome: "ok"});
        // A second call (e.g. from a future refactor that adds a terminal path
        // without returning) must not inflate one attempt into two results.
        reportResult({outcome: "failed", failurePhase: "persist"});

        expect(events.map((e) => e.name)).to.deep.equal([
            "python_env.setup.attempt",
            "python_env.setup.result",
        ]);
        expect(events[1].props["event.outcome"]).to.equal("ok");
    });

    it("passes through the CLI's documented env-key shapes", () => {
        for (const envKey of [
            "serverless/serverless-v5",
            "serverless/serverless-v12",
            "dbr/15.4.x-scala2.12",
            "dbr/14.3.x-photon-scala2.12",
        ]) {
            const {telemetry, events} = makeTelemetry();
            telemetry.recordPythonSetupAttempt({
                packageManager: "uv",
                targetType: "cluster",
                mode: "default",
                trigger: "initial",
            })({outcome: "ok", envKey});
            expect(events[1].props["event.envKey"]).to.equal(envKey);
        }
    });

    it("collapses an unrecognised env key to a categorical placeholder", () => {
        // The DBR arm of the key is a raw "dbr/" + sparkVersion concatenation
        // from minimally-validated CLI JSON, so schema drift must not put
        // unbounded (potentially identifying) content into the field.
        for (const envKey of [
            "cluster-0710-142042-abcdefgh",
            "dbr/../../etc/passwd",
            "/Users/someone/projects/secret-project",
            "serverless/serverless-vNEXT",
            "",
            // Cluster *names* are user-chosen and often contain a person's
            // name. These must not pass as a "spark version".
            "dbr/janes-dev-cluster",
            "dbr/johns.laptop.cluster",
            "dbr/jdoe-databricks-com",
            `dbr/${"a".repeat(500)}`,
        ]) {
            const {telemetry, events} = makeTelemetry();
            telemetry.recordPythonSetupAttempt({
                packageManager: "uv",
                targetType: "cluster",
                mode: "default",
                trigger: "initial",
            })({outcome: "ok", envKey});
            expect(events[1].props["event.envKey"]).to.equal("other");
        }
    });

    it("emits a warning count and a categorical per-code histogram", () => {
        const {telemetry, events} = makeTelemetry();

        telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "serverless",
            serverlessVersion: "5",
            mode: "default",
            trigger: "initial",
        })({
            outcome: "ok",
            envKey: "serverless/serverless-v5",
            warnings: [
                {code: "W_REQUIRES_PYTHON_OVERRIDDEN", message: "irrelevant"},
                {code: "W_DBCONNECT_PIN_OVERRIDDEN", message: "irrelevant"},
                {code: "W_DBCONNECT_PIN_DUPLICATED", message: "irrelevant"},
                {code: "W_USER_CONSTRAINT_CONFLICT", message: "irrelevant"},
                {code: "W_USER_CONSTRAINT_CONFLICT", message: "irrelevant"},
            ],
        });

        // The total is a numeric metric, not a property.
        expect(events[1].metrics["event.warningsCount"]).to.equal(5);
        expect(events[1].props).to.not.have.property("event.warningsCount");
        // The per-code counts are a JSON-stringified property (objects never
        // become metrics), covering all four known codes with the repeated one
        // counted twice.
        expect(
            JSON.parse(events[1].props["event.warningCodeCounts"])
        ).to.deep.equal({
            W_REQUIRES_PYTHON_OVERRIDDEN: 1,
            W_DBCONNECT_PIN_OVERRIDDEN: 1,
            W_DBCONNECT_PIN_DUPLICATED: 1,
            W_USER_CONSTRAINT_CONFLICT: 2,
        });
    });

    it("reports warningsCount 0 and omits the histogram for a clean merge", () => {
        const {telemetry, events} = makeTelemetry();

        // A result with no warnings: 0 is a real value (unlike an omitted field),
        // so it is emitted — but an empty "{}" histogram string is not.
        telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "serverless",
            serverlessVersion: "5",
            mode: "default",
            trigger: "initial",
        })({outcome: "ok", envKey: "serverless/serverless-v5", warnings: []});

        expect(events[1].metrics["event.warningsCount"]).to.equal(0);
        expect(events[1].props).to.not.have.property("event.warningCodeCounts");
    });

    it("collapses an unrecognised warning code to 'other'", () => {
        // A code the CLI adds before this list is updated (or any drift) must not
        // mint a new histogram bucket, and the free-form parts of a warning must
        // never reach the wire.
        const {telemetry, events} = makeTelemetry();

        telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            trigger: "initial",
        })({
            outcome: "ok",
            warnings: [
                {code: "W_REQUIRES_PYTHON_OVERRIDDEN", message: "irrelevant"},
                {
                    code: "W_SOME_FUTURE_CLI_CODE",
                    message: "resolving for jane@example.com",
                },
                {code: "/Users/jane/secret-project", message: "irrelevant"},
            ],
        });

        expect(events[1].metrics["event.warningsCount"]).to.equal(3);
        expect(
            JSON.parse(events[1].props["event.warningCodeCounts"])
        ).to.deep.equal({
            W_REQUIRES_PYTHON_OVERRIDDEN: 1,
            other: 2,
        });
        const serialized = JSON.stringify(events[1].props);
        expect(serialized).to.not.contain("jane");
        expect(serialized).to.not.contain("example.com");
        expect(serialized).to.not.contain("secret-project");
    });

    it("omits the warning fields when the CLI produced no result", () => {
        const {telemetry, events} = makeTelemetry();

        // cancelled / not_started / no_compute carry no `warnings` array, so
        // neither the count nor the histogram is emitted (0 would be a lie: no
        // merge ran).
        telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            trigger: "initial",
        })({outcome: "cancelled"});

        expect(events[1].metrics).to.not.have.property("event.warningsCount");
        expect(events[1].props).to.not.have.property("event.warningCodeCounts");
    });

    it("emits only the schema's fields, never extra ones on the caller's object", () => {
        const {telemetry, events} = makeTelemetry();

        // Model a future refactor that widens the attempt/report objects (or
        // passes a wider object through this seam). The transport must be an
        // allowlist: TypeScript's excess-property check does not apply to a
        // spread variable, so the emit half is the only place this can be
        // enforced.
        telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            trigger: "initial",
            clusterId: "0710-142042-secretcluster",
            projectPath: "/Users/jane/projects/acme",
        } as any)({
            outcome: "ok",
            envKey: "dbr/15.4.x-scala2.12",
            rawCliMessage: "failed for user jane@example.com",
        } as any);

        for (const event of events) {
            const serialized = JSON.stringify(event.props);
            expect(serialized).to.not.contain("0710");
            expect(serialized).to.not.contain("jane");
            expect(serialized).to.not.contain("acme");
        }
        expect(Object.keys(events[0].props).sort()).to.deep.equal([
            "event.mode",
            "event.packageManager",
            "event.targetType",
            "event.trigger",
            "version",
        ]);
        expect(Object.keys(events[1].props).sort()).to.deep.equal([
            "event.envKey",
            "event.outcome",
            "version",
        ]);
    });

    it("reports no_compute on its own, with no attempt and no duration", () => {
        const {telemetry, events} = makeTelemetry();

        telemetry.recordPythonSetupNoCompute();

        expect(events).to.have.length(1);
        expect(events[0].name).to.equal("python_env.setup.result");
        expect(events[0].props).to.deep.equal({
            "version": "1.0",
            "event.outcome": "no_compute",
        });
        // Nothing ran, so a 0ms duration would drag the setup-time percentiles
        // down rather than describing anything.
        expect(events[0].metrics).to.not.have.property("event.duration");
    });

    it("sends nothing when the telemetry reporter is unavailable", () => {
        // No reporter: recordEvent short-circuits, so neither event is built.
        // (Level-based opt-out is enforced inside the real reporter and covered
        // by the client's own tests.)
        const telemetry = new Telemetry(undefined);

        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
            trigger: "initial",
        });

        expect(() => reportResult({outcome: "ok"})).to.not.throw();
        expect(telemetry.isTelemetryEnabled).to.equal(false);
    });
});
