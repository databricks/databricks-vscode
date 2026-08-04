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

    it("sends nothing when the telemetry reporter is unavailable", () => {
        // No reporter: recordEvent short-circuits, so neither event is built.
        // (Level-based opt-out is enforced inside the real reporter and covered
        // by the client's own tests.)
        const telemetry = new Telemetry(undefined);

        const reportResult = telemetry.recordPythonSetupAttempt({
            packageManager: "uv",
            targetType: "cluster",
            mode: "default",
        });

        expect(() => reportResult({outcome: "ok"})).to.not.throw();
        expect(telemetry.isTelemetryEnabled).to.equal(false);
    });
});
