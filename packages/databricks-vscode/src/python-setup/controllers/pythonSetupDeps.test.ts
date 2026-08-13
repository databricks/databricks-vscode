import {expect} from "chai";
import {env, Uri, window} from "vscode";
import {
    makePythonSetupDeps,
    makePythonSetupVisibility,
    PythonSetupWiringDeps,
    resolveComputeFrom,
} from "./pythonSetupDeps";
import {PythonSetupState} from "../../vscode-objs/StateStorage";
import {Telemetry} from "../../telemetry";
import {
    SUCCESS_DEFAULT,
    SUCCESS_WITH_WARNINGS,
} from "../models/fixtures/setupLocalResults";

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
        ).to.deep.equal({
            status: "ok",
            compute: {kind: "cluster", clusterId: "0101-clusterid"},
        });
    });

    it("returns a serverless target with the persisted version", () => {
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: undefined,
                serverlessVersion: "5",
            })
        ).to.deep.equal({
            status: "ok",
            compute: {kind: "serverless", version: "5"},
        });
    });

    it("asks for a version when serverless is attached without one", () => {
        // The distinguishing state: compute IS selected, only the version is
        // missing -- so the caller must resolve one rather than claim nothing
        // is attached.
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: undefined,
                serverlessVersion: undefined,
            })
        ).to.deep.equal({status: "needsServerlessVersion"});
    });

    it("returns none when no compute is selected", () => {
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: undefined,
                serverlessVersion: undefined,
            })
        ).to.deep.equal({status: "none"});
    });

    it("prefers a cluster over a stale serverless version", () => {
        // Cluster attached wins; the serverless version is irrelevant then.
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: {id: "c1"},
                serverlessVersion: "5",
            })
        ).to.deep.equal({
            status: "ok",
            compute: {kind: "cluster", clusterId: "c1"},
        });
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
        ).to.deep.equal({
            status: "ok",
            compute: {kind: "cluster", clusterId: "c1"},
        });
    });

    it("never asks for a version when a cluster is attached without one", () => {
        // Guards the cluster path against the version prompt leaking into it:
        // a cluster's DBR fully determines the environment.
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: {id: "c1"},
                serverlessVersion: undefined,
            })
        ).to.deep.equal({
            status: "ok",
            compute: {kind: "cluster", clusterId: "c1"},
        });
    });
});

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
        promptServerlessVersion: async () => "4",
        persistServerlessVersion: async () => {},
        setActiveInterpreter: async () => {},
        persistSetupState: () => {},
        log: {append: () => {}, show: () => {}},
        // A reporter-less client: recordEvent short-circuits, so the setup
        // events are inert here (they have their own tests).
        telemetry: new Telemetry(undefined),
        ...overrides,
    };
}

describe("makePythonSetupDeps resolveCompute", () => {
    /** A serverless session with no version recorded -- the prompt's reason to exist. */
    const versionlessServerless = () => ({
        serverless: true,
        cluster: undefined,
        serverlessVersion: undefined,
    });

    it("prompts for a missing serverless version and persists the answer", async () => {
        const persisted: string[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                attachedCompute: versionlessServerless,
                promptServerlessVersion: async () => "4",
                persistServerlessVersion: async (v) => {
                    persisted.push(v);
                },
            })
        );

        expect(await deps.resolveCompute()).to.deep.equal({
            status: "ok",
            compute: {kind: "serverless", version: "4"},
        });
        // Persisted so the next run does not ask again.
        expect(persisted).to.deep.equal(["4"]);
    });

    it("reports cancelled and persists nothing when the prompt is dismissed", async () => {
        const persisted: string[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                attachedCompute: versionlessServerless,
                promptServerlessVersion: async () => undefined,
                persistServerlessVersion: async (v) => {
                    persisted.push(v);
                },
            })
        );

        expect(await deps.resolveCompute()).to.deep.equal({
            status: "cancelled",
        });
        expect(persisted).to.have.length(0);
    });

    it("never prompts when a cluster is attached", async () => {
        let prompted = 0;
        const deps = makePythonSetupDeps(
            makeWiring({
                attachedCompute: () => ({
                    serverless: false,
                    cluster: {id: "c1"},
                    serverlessVersion: undefined,
                }),
                promptServerlessVersion: async () => {
                    prompted++;
                    return "4";
                },
            })
        );

        expect(await deps.resolveCompute()).to.deep.equal({
            status: "ok",
            compute: {kind: "cluster", clusterId: "c1"},
        });
        expect(prompted).to.equal(0);
    });

    it("never prompts when nothing is attached", async () => {
        // Nothing selected is a real dead end, not a missing detail: the flow
        // must guide the user, not open a version picker.
        let prompted = 0;
        const deps = makePythonSetupDeps(
            makeWiring({
                promptServerlessVersion: async () => {
                    prompted++;
                    return "4";
                },
            })
        );

        expect(await deps.resolveCompute()).to.deep.equal({status: "none"});
        expect(prompted).to.equal(0);
    });

    it("never prompts when serverless already has a version", async () => {
        let prompted = 0;
        const deps = makePythonSetupDeps(
            makeWiring({
                attachedCompute: () => ({
                    serverless: true,
                    cluster: undefined,
                    serverlessVersion: "5",
                }),
                promptServerlessVersion: async () => {
                    prompted++;
                    return "4";
                },
            })
        );

        expect(await deps.resolveCompute()).to.deep.equal({
            status: "ok",
            compute: {kind: "serverless", version: "5"},
        });
        expect(prompted).to.equal(0);
    });

    it("still runs when persisting the version fails", async () => {
        // Persistence only buys "don't ask again"; losing it must not cost the
        // user the run they asked for.
        const deps = makePythonSetupDeps(
            makeWiring({
                attachedCompute: versionlessServerless,
                promptServerlessVersion: async () => "4",
                persistServerlessVersion: async () => {
                    throw new Error("config write failed");
                },
            })
        );

        expect(await deps.resolveCompute()).to.deep.equal({
            status: "ok",
            compute: {kind: "serverless", version: "4"},
        });
    });
});

describe("makePythonSetupDeps saveState", () => {
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

describe("makePythonSetupDeps showError", () => {
    let originalShowError: typeof window.showErrorMessage;
    let shownWith: {message: string; actions: string[]}[];
    let reply: string | undefined;

    beforeEach(() => {
        originalShowError = window.showErrorMessage;
        shownWith = [];
        reply = undefined;
        // Capture what the error popup is shown with, and control what the user
        // "clicks". (ts-mockito can't stub the vscode namespace, so swap the fn.)
        (window as unknown as {showErrorMessage: unknown}).showErrorMessage =
            async (message: string, ...actions: string[]) => {
                shownWith.push({message, actions});
                return reply;
            };
    });

    afterEach(() => {
        (window as unknown as {showErrorMessage: unknown}).showErrorMessage =
            originalShowError;
    });

    it("writes the detail into the log channel", async () => {
        const appended: string[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {append: (c) => appended.push(c), show: () => {}},
            })
        );

        await deps.showError("friendly copy", "raw conflict detail");

        expect(appended.join("")).to.contain("raw conflict detail");
    });

    it("reveals the channel automatically and offers a Show Logs action", async () => {
        let shown = 0;
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {
                    append: () => {},
                    show: () => {
                        shown++;
                    },
                },
            })
        );
        reply = "Show Logs";

        await deps.showError("friendly copy", "detail");

        expect(shownWith).to.have.length(1);
        expect(shownWith[0].message).to.equal("friendly copy");
        expect(shownWith[0].actions).to.contain("Show Logs");
        // Once on the automatic reveal, again when the button is picked.
        expect(shown).to.equal(2);
    });

    it("still reveals the channel when the popup is dismissed", async () => {
        let shown = 0;
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {
                    append: () => {},
                    show: () => {
                        shown++;
                    },
                },
            })
        );
        reply = undefined; // user dismissed the popup without clicking

        await deps.showError("friendly copy", "detail");

        // The automatic reveal fires regardless of what the user clicks.
        expect(shown).to.equal(1);
    });

    it("still offers the button but writes nothing when there is no detail", async () => {
        const appended: string[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {append: (c) => appended.push(c), show: () => {}},
            })
        );

        await deps.showError("friendly copy");

        expect(appended).to.have.length(0);
        expect(shownWith[0].actions).to.contain("Show Logs");
    });

    it("offers the given action button and opens its URL when picked", async () => {
        const originalOpen = env.openExternal;
        const opened: string[] = [];
        (env as unknown as {openExternal: unknown}).openExternal = async (
            uri: Uri
        ) => {
            opened.push(uri.toString(true));
            return true;
        };
        try {
            const deps = makePythonSetupDeps(
                makeWiring({log: {append: () => {}, show: () => {}}})
            );
            reply = "Install uv";

            await deps.showError("uv missing", "detail", {
                label: "Install uv",
                url: "https://docs.astral.sh/uv/getting-started/installation/",
            });

            expect(shownWith[0].actions).to.contain("Install uv");
            expect(shownWith[0].actions).to.contain("Show Logs");
            expect(opened).to.deep.equal([
                "https://docs.astral.sh/uv/getting-started/installation/",
            ]);
        } finally {
            (env as unknown as {openExternal: unknown}).openExternal =
                originalOpen;
        }
    });

    it("does not open the URL when the action button is not picked", async () => {
        const originalOpen = env.openExternal;
        const opened: string[] = [];
        (env as unknown as {openExternal: unknown}).openExternal = async (
            uri: Uri
        ) => {
            opened.push(uri.toString(true));
            return true;
        };
        try {
            const deps = makePythonSetupDeps(
                makeWiring({log: {append: () => {}, show: () => {}}})
            );
            reply = "Show Logs";

            await deps.showError("uv missing", "detail", {
                label: "Install uv",
                url: "https://docs.astral.sh/uv/getting-started/installation/",
            });

            expect(opened).to.have.length(0);
        } finally {
            (env as unknown as {openExternal: unknown}).openExternal =
                originalOpen;
        }
    });
});

describe("makePythonSetupDeps showSuccess", () => {
    let originalInfo: typeof window.showInformationMessage;
    let originalWarn: typeof window.showWarningMessage;
    let infoShownWith: {message: string; actions: string[]}[];
    let warnShownWith: {message: string; actions: string[]}[];
    let reply: string | undefined;

    beforeEach(() => {
        originalInfo = window.showInformationMessage;
        originalWarn = window.showWarningMessage;
        infoShownWith = [];
        warnShownWith = [];
        reply = undefined;
        // ts-mockito can't stub the vscode namespace, so swap the fns to
        // capture what each notification is raised with and what the user
        // "clicks".
        (
            window as unknown as {showInformationMessage: unknown}
        ).showInformationMessage = async (
            message: string,
            ...actions: string[]
        ) => {
            infoShownWith.push({message, actions});
            return reply;
        };
        (
            window as unknown as {showWarningMessage: unknown}
        ).showWarningMessage = async (
            message: string,
            ...actions: string[]
        ) => {
            warnShownWith.push({message, actions});
            return reply;
        };
    });

    afterEach(() => {
        (
            window as unknown as {showInformationMessage: unknown}
        ).showInformationMessage = originalInfo;
        (
            window as unknown as {showWarningMessage: unknown}
        ).showWarningMessage = originalWarn;
    });

    it("writes the details, reveals the channel and raises an info toast", async () => {
        let shown = 0;
        const appended: string[] = [];
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {
                    append: (c) => appended.push(c),
                    show: () => {
                        shown++;
                    },
                },
            })
        );

        await deps.showSuccess(SUCCESS_DEFAULT);

        expect(appended.join("")).to.have.length.greaterThan(0);
        // The automatic reveal fires regardless of what the user clicks.
        expect(shown).to.equal(1);
        expect(infoShownWith).to.have.length(1);
        expect(infoShownWith[0].actions).to.contain("View Details");
        expect(warnShownWith).to.have.length(0);
    });

    it("raises a warning toast when the run had warnings", async () => {
        const deps = makePythonSetupDeps(makeWiring());

        await deps.showSuccess(SUCCESS_WITH_WARNINGS);

        expect(warnShownWith).to.have.length(1);
        expect(warnShownWith[0].actions).to.contain("View Details");
        expect(infoShownWith).to.have.length(0);
    });

    it("reveals the channel again when View Details is picked", async () => {
        let shown = 0;
        const deps = makePythonSetupDeps(
            makeWiring({
                log: {
                    append: () => {},
                    show: () => {
                        shown++;
                    },
                },
            })
        );
        reply = "View Details";

        await deps.showSuccess(SUCCESS_DEFAULT);

        // Once on the automatic reveal, again when the button is picked.
        expect(shown).to.equal(2);
    });
});
