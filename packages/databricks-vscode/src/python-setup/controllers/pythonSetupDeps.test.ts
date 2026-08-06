import {expect} from "chai";
import {Uri} from "vscode";
import {
    makePythonSetupDeps,
    makePythonSetupVisibility,
    PythonSetupWiringDeps,
    resolveComputeFrom,
} from "./pythonSetupDeps";
import {PythonSetupState} from "../../vscode-objs/StateStorage";
import {Telemetry} from "../../telemetry";

describe("makePythonSetupVisibility", () => {
    const uvDetection = {
        primary: "uv" as const,
        managers: ["uv" as const],
        signals: [],
    };

    it("is hidden when the feature flag is off, regardless of project", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => false,
            detect: async () => uvDetection,
            projectRoot: () => "/proj",
        });
        expect(await isVisible()).to.equal(false);
    });

    it("is hidden when there is no open project", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => uvDetection,
            projectRoot: () => undefined,
        });
        expect(await isVisible()).to.equal(false);
    });

    it("is visible for a clean uv project when opted in", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => uvDetection,
            projectRoot: () => "/proj",
        });
        expect(await isVisible()).to.equal(true);
    });

    it("is hidden for a project with a competing manager", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => ({
                primary: "uv" as const,
                managers: ["uv" as const, "pip" as const],
                signals: ["requirements.txt" as const],
            }),
            projectRoot: () => "/proj",
        });
        expect(await isVisible()).to.equal(false);
    });
});

describe("resolveComputeFrom", () => {
    it("returns a cluster target when a cluster is attached", () => {
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: {id: "0101-clusterid"},
                serverlessVersion: undefined,
            })
        ).to.deep.equal({kind: "cluster", clusterId: "0101-clusterid"});
    });

    it("returns a serverless target with the persisted version", () => {
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: undefined,
                serverlessVersion: "5",
            })
        ).to.deep.equal({kind: "serverless", version: "5"});
    });

    it("returns undefined for serverless without a chosen version", () => {
        // A version-less serverless selection cannot be provisioned yet -- the
        // compute picker sub-step (or a fallback) supplies the version.
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: undefined,
                serverlessVersion: undefined,
            })
        ).to.equal(undefined);
    });

    it("returns undefined when no compute is selected", () => {
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: undefined,
                serverlessVersion: undefined,
            })
        ).to.equal(undefined);
    });

    it("prefers a cluster over a stale serverless version", () => {
        // Cluster attached wins; the serverless version is irrelevant then.
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: {id: "c1"},
                serverlessVersion: "5",
            })
        ).to.deep.equal({kind: "cluster", clusterId: "c1"});
    });

    it("prefers a cluster even when serverless is also set", () => {
        // A cluster attachment wins outright regardless of serverless state --
        // pin the precedence so a future reorder can't silently pick serverless.
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: {id: "c1"},
                serverlessVersion: "5",
            })
        ).to.deep.equal({kind: "cluster", clusterId: "c1"});
    });
});

describe("makePythonSetupDeps saveState", () => {
    function makeWiring(
        overrides: Partial<PythonSetupWiringDeps> = {}
    ): PythonSetupWiringDeps {
        return {
            cli: {run: async () => ({}) as any},
            projectRoot: () => "/proj",
            isEnabled: () => true,
            detect: async () => ({
                primary: "uv" as const,
                managers: ["uv" as const],
                signals: [],
            }),
            attachedCompute: () => ({
                serverless: false,
                cluster: undefined,
                serverlessVersion: undefined,
            }),
            setActiveInterpreter: async () => {},
            persistSetupState: () => {},
            log: {append: () => {}, show: () => {}},
            // A reporter-less client: recordEvent short-circuits, so the setup
            // events are inert here (they have their own tests).
            telemetry: new Telemetry(undefined),
            ...overrides,
        };
    }

    it("stamps a timestamp and forwards the persisted state", () => {
        const persisted: PythonSetupState[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                persistSetupState: (s) => persisted.push(s),
            })
        );

        deps.saveState({
            envKey: "serverless/serverless-v5",
            pythonVersion: "3.12",
        });

        expect(persisted).to.have.length(1);
        expect(persisted[0].envKey).to.equal("serverless/serverless-v5");
        expect(persisted[0].pythonVersion).to.equal("3.12");
        // A wiring-supplied ISO-8601 timestamp is added.
        expect(persisted[0].timestamp).to.be.a("string");
        expect(Number.isNaN(Date.parse(persisted[0].timestamp))).to.equal(
            false
        );
    });

    it("adopts the venv interpreter for the passed root, not the live projectRoot", async () => {
        const adopted: Array<{path: string; root: string}> = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                // The live active project differs from the run's captured root;
                // adoption must use the root it is given, not re-read this.
                projectRoot: () => "/other",
                setActiveInterpreter: async (path, root: Uri) => {
                    adopted.push({path, root: root.fsPath});
                },
            })
        );

        await deps.adoptInterpreter("/proj/.venv", "/proj");

        expect(adopted).to.have.length(1);
        expect(adopted[0].path).to.match(/\.venv[\\/](bin[\\/]python|Scripts)/);
        // The seam receives `Uri.file(root).fsPath`; compare against that rather
        // than the literal so the assertion holds on Windows (where fsPath is
        // `\proj`) as well as POSIX (`/proj`).
        expect(adopted[0].root).to.equal(Uri.file("/proj").fsPath);
    });
});

describe("makePythonSetupVisibility error handling", () => {
    const uvDetection = {
        primary: "uv" as const,
        managers: ["uv" as const],
        signals: [],
    };

    it("degrades to not-visible when detection rejects (never throws)", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => {
                throw new Error("signal collection blew up");
            },
            projectRoot: () => "/proj",
        });
        // Must resolve false, not reject: a throwing gate would blank the
        // Environment section instead of showing the legacy checklist.
        expect(await isVisible()).to.equal(false);
    });

    it("degrades to not-visible when projectRoot throws", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => uvDetection,
            projectRoot: () => {
                throw new Error("no active project folder");
            },
        });
        expect(await isVisible()).to.equal(false);
    });
});

describe("makePythonSetupDeps withProgress", () => {
    function makeWiring(
        overrides: Partial<PythonSetupWiringDeps> = {}
    ): PythonSetupWiringDeps {
        return {
            cli: {run: async () => ({}) as any},
            projectRoot: () => "/proj",
            isEnabled: () => true,
            detect: async () => ({
                primary: "uv" as const,
                managers: ["uv" as const],
                signals: [],
            }),
            attachedCompute: () => ({
                serverless: false,
                cluster: undefined,
                serverlessVersion: undefined,
            }),
            setActiveInterpreter: async () => {},
            persistSetupState: () => {},
            log: {append: () => {}, show: () => {}},
            // A reporter-less client: recordEvent short-circuits, so the setup
            // events are inert here (they have their own tests).
            telemetry: new Telemetry(undefined),
            ...overrides,
        };
    }

    it("forwards streamed log chunks to the injected channel", async () => {
        const appended: string[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {append: (c) => appended.push(c), show: () => {}},
            })
        );

        const result = await deps.withProgress("Setting up", async (log) => {
            log("chunk-a");
            log("chunk-b");
            return "done";
        });

        expect(result).to.equal("done");
        expect(appended).to.deep.equal(["chunk-a", "chunk-b"]);
    });

    it("hands the task a cancellation token (so cancel can tear down)", async () => {
        const deps = makePythonSetupDeps(makeWiring());

        const token = await deps.withProgress(
            "Setting up",
            async (_log, token) => token
        );

        // A real CancellationToken is provided -- the wiring passes
        // cancellable:true, so this reflects the user's Cancel button.
        expect(token).to.not.equal(undefined);
        expect(token.isCancellationRequested).to.equal(false);
    });
});
