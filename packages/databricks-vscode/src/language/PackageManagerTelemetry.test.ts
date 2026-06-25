import {expect} from "chai";
import * as tmp from "tmp";
import path from "node:path";
import {writeFileSync} from "node:fs";
import {Telemetry} from "../telemetry";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {PackageManagerTelemetry, SetupTrigger} from "./PackageManagerTelemetry";

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
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        while (cleanups.length) {
            cleanups.pop()!();
        }
    });

    /**
     * Create a throwaway project dir populated with the given files, passed as
     * [name, contents] tuples (file names aren't valid identifiers, so a tuple
     * list avoids object-literal key lint noise).
     */
    function makeProject(files: Array<[string, string]>): string {
        const dir = tmp.dirSync({unsafeCleanup: true});
        cleanups.push(dir.removeCallback);
        for (const [name, contents] of files) {
            writeFileSync(path.join(dir.name, name), contents);
        }
        return dir.name;
    }

    // Interpreter is irrelevant to these disk-signal tests; report none.
    const noInterpreter = {
        get pythonEnvironment() {
            return Promise.resolve(undefined);
        },
    } as unknown as MsPythonExtensionWrapper;

    function makePmt(
        telemetry: Telemetry,
        opts: {
            projectRoot: string;
            compute?: "cluster" | "serverless" | "none";
            connected?: boolean;
        }
    ) {
        return new PackageManagerTelemetry(
            telemetry,
            noInterpreter,
            () => opts.projectRoot,
            () => opts.compute ?? "none",
            () => opts.connected ?? true
        );
    }

    const emit = async (pmt: PackageManagerTelemetry, t: SetupTrigger) =>
        pmt.emitDetection(t);

    it("emits a detection event for a connected project (uv + pip)", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([
            ["uv.lock", "version = 1\n"],
            ["pyproject.toml", "[project]\nname='x'\n[tool.uv]\n"],
            ["requirements-dev.txt", "requests\n"],
        ]);
        const pmt = makePmt(telemetry, {projectRoot, compute: "cluster"});

        await emit(pmt, "explicit_command");

        expect(events).to.have.length(1);
        const e = events[0];
        expect(e.name).to.equal("python_env.setup.detected");
        expect(e.props["event.primaryManager"]).to.equal("uv");
        expect(e.props["event.managersDetected"]).to.equal('["uv","pip"]');
        expect(e.props["event.hasLockfile"]).to.equal("true");
        expect(e.props["event.targetCompute"]).to.equal("cluster");
        expect(e.props["event.setupTrigger"]).to.equal("explicit_command");
        expect(e.props["event.interpreterSource"]).to.equal("unknown");
    });

    it("deduplicates per (trigger, projectRoot) within a session", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([["uv.lock", "version = 1\n"]]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");
        await emit(pmt, "auto_open");

        expect(events).to.have.length(1);
    });

    it("does not emit while disconnected, and does not burn the dedupe slot", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([["uv.lock", "version = 1\n"]]);

        const disconnected = makePmt(telemetry, {
            projectRoot,
            connected: false,
        });
        await emit(disconnected, "auto_open");
        expect(events).to.have.length(0);

        // A later connected emit for the same (trigger, project) still fires --
        // i.e. the disconnected attempt did not consume the dedupe key.
        const connected = makePmt(telemetry, {projectRoot, connected: true});
        await emit(connected, "auto_open");
        expect(events).to.have.length(1);
    });

    it("does not emit when telemetry is disabled", async () => {
        const {telemetry, events} = makeTelemetry("error");
        const projectRoot = makeProject([["uv.lock", "version = 1\n"]]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");

        expect(events).to.have.length(0);
    });

    it("reports unknown for a project with no recognizable signals", async () => {
        const {telemetry, events} = makeTelemetry("all");
        // `requirementsfoo.txt` (no separator) is NOT a requirements file, so
        // pip must not be attributed.
        const projectRoot = makeProject([["requirementsfoo.txt", "x\n"]]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");

        expect(events).to.have.length(1);
        expect(events[0].props["event.managersDetected"]).to.equal("[]");
        expect(events[0].props["event.primaryManager"]).to.equal("unknown");
    });

    it("attributes pip from a separator-suffixed requirements file", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([
            ["requirements_test.txt", "pytest\n"],
        ]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");

        expect(events[0].props["event.managersDetected"]).to.equal('["pip"]');
        expect(events[0].props["event.primaryManager"]).to.equal("pip");
    });
});
