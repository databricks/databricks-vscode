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
            setupMode?: "auto" | "manual";
        }
    ) {
        return new PackageManagerTelemetry(
            telemetry,
            noInterpreter,
            () => opts.projectRoot,
            () => opts.compute ?? "none",
            () => opts.connected ?? true,
            () => opts.setupMode ?? "auto"
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
        // primaryManager is uv, yet a real pip signal (requirements-dev.txt)
        // makes the project not uv-suitable, so the flow is pip — setupMode
        // tracks the effective flow, not the primary manager.
        expect(e.props["event.setupMode"]).to.equal("pip");
    });

    it("reports setupMode=uv for a clean, auto uv project", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([["uv.lock", "version = 1\n"]]);
        const pmt = makePmt(telemetry, {projectRoot}); // setupMode defaults to auto

        await emit(pmt, "auto_open");

        expect(events[0].props["event.setupMode"]).to.equal("uv");
    });

    it("reports setupMode=pip for an auto, non-uv (requirements) project", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([["requirements.txt", "requests\n"]]);
        const pmt = makePmt(telemetry, {projectRoot}); // setupMode defaults to auto

        await emit(pmt, "auto_open");

        expect(events[0].props["event.primaryManager"]).to.equal("pip");
        expect(events[0].props["event.setupMode"]).to.equal("pip");
    });

    it("reports setupMode=fallback-pip when the user opted out (manual)", async () => {
        const {telemetry, events} = makeTelemetry("all");
        // A clean uv project that would be "uv" on auto — manual still wins.
        const projectRoot = makeProject([["uv.lock", "version = 1\n"]]);
        const pmt = makePmt(telemetry, {projectRoot, setupMode: "manual"});

        await emit(pmt, "auto_open");

        expect(events[0].props["event.setupMode"]).to.equal("fallback-pip");
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

    it("does not attribute pip for a tool-only pyproject", async () => {
        const {telemetry, events} = makeTelemetry("all");
        // Only linter config, no [project]/[build-system] -- not a pip signal.
        const projectRoot = makeProject([
            ["pyproject.toml", "[tool.ruff]\nline-length = 88\n"],
        ]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");

        expect(events[0].props["event.managersDetected"]).to.equal("[]");
        expect(events[0].props["event.primaryManager"]).to.equal("unknown");
    });

    it("attributes pip for a pyproject with [project] and no uv/poetry", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([
            ["pyproject.toml", '[project]\nname = "x"\n'],
        ]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");

        expect(events[0].props["event.managersDetected"]).to.equal('["pip"]');
    });

    it("omits pythonVersion from the event when the interpreter is unknown", async () => {
        const {telemetry, events} = makeTelemetry("all");
        const projectRoot = makeProject([["uv.lock", "version = 1\n"]]);
        const pmt = makePmt(telemetry, {projectRoot});

        await emit(pmt, "auto_open");

        // The key must be absent, not the string "undefined".
        expect(events[0].props).to.not.have.property("event.pythonVersion");
    });
});
