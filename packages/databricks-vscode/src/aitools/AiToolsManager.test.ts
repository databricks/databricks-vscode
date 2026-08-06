/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {commands, Uri} from "vscode";
import path from "path";
import {
    AiToolsAgent,
    AiToolsListResult,
    CliWrapper,
    ProcessError,
} from "../cli/CliWrapper";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import {
    AiToolsManager,
    CURSOR_AGENT_ID,
    StateFileLoader,
} from "./AiToolsManager";
import {FileUtils, HostUtils} from "../utils";

// State-file loaders passed to createManager, one per scope, standing in for the
// on-disk `.state.json` read with no real I/O. The manager only cares whether
// the read resolves or rejects (and whether the rejection is ENOENT).

/** The state file exists and was read successfully -> tools are installed. */
const loadSuccess: StateFileLoader = async () => undefined;

/** The state file is absent (ENOENT) -> tools are not installed. */
const throwNotFound: StateFileLoader = async () => {
    const err: NodeJS.ErrnoException = new Error("ENOENT: no such file");
    err.code = "ENOENT";
    throw err;
};

/** An unexpected read failure (non-ENOENT), e.g. a permission/IO error. */
const throwReadError: StateFileLoader = async () => {
    const err: NodeJS.ErrnoException = new Error("EACCES: permission denied");
    err.code = "EACCES";
    throw err;
};

/** Per-scope state-file loaders; a missing scope defaults to {@link throwNotFound}. */
interface ScopeLoaders {
    project?: StateFileLoader;
    global?: StateFileLoader;
}

function listResult(
    skills: Array<{
        name: string;
        latest_version: string;
        installed: Record<string, string>;
    }>,
    agents: AiToolsAgent[] = []
): AiToolsListResult {
    return {
        release: "0.2.9",
        skills: skills.map((s) => ({
            experimental: false,
            ...s,
        })),
        agents,
    };
}

// The project root the WorkspaceFolderManager mock reports; the global root is
// the real home dir (the manager derives it from getHomedir()). The injected
// loader maps a state-file path back to its scope by the projectDir prefix.
const projectDir = path.join(path.sep, "tmp", "aitools-proj");
const homeDir = FileUtils.getHomedir();

// Build a manager whose state-file loader resolves per scope. `loaders` is
// read on every load, so tests can reassign `loaders.project` /
// `loaders.global` mid-test to simulate an install/uninstall. A scope with
// no loader defaults to throwNotFound (not installed).
function setup(loaders: ScopeLoaders = {}) {
    const loadStateFile: StateFileLoader = (p) => {
        const scope = p.startsWith(projectDir) ? "project" : "global";
        return (loaders[scope] ?? throwNotFound)(p);
    };

    const mockCli = mock(CliWrapper);

    const mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
    when(mockWorkspaceFolderManager.activeProjectUri).thenReturn(
        Uri.file(projectDir)
    );
    // Capture the listener the manager registers for active-project changes so
    // tests can fire it and await the resulting refresh. Returns a disposable to
    // match the vscode Event contract.
    const activeFolderListeners: Array<(uri: Uri | undefined) => unknown> = [];
    when(
        mockWorkspaceFolderManager.onDidChangeActiveProjectFolder(anything())
    ).thenCall((listener) => {
        activeFolderListeners.push(listener);
        return {dispose() {}};
    });
    // Invoke every registered listener and await any promises they return, so a
    // test can deterministically drive the manager's async refresh.
    const fireActiveFolderChange = async (uri?: Uri) => {
        await Promise.all(activeFolderListeners.map((l) => l(uri)));
    };

    const stubStateStorage = {
        state: {} as Record<string, any>,
        get(key: string) {
            return this.state[key];
        },
        set(key: string, value: any) {
            this.state[key] = value;
        },
        onDidChange: () => ({dispose() {}}),
    };
    const stubTelemetry = {
        events: [] as {event: string; props: any}[],
        start(event: string) {
            return (props: any) => {
                this.events.push({event, props});
            };
        },
        recordEvent(event: string, props: any) {
            this.events.push({event, props});
        },
        eventsOfType(event: string) {
            return this.events.filter((e) => e.event === event);
        },
    };

    return {
        mockCli,
        mockWorkspaceFolderManager,
        stubStateStorage,
        stubTelemetry,
        fireActiveFolderChange,
        manager: new AiToolsManager(
            instance(mockCli),
            stubStateStorage as unknown as StateStorage,
            instance(mockWorkspaceFolderManager),
            // A real CustomWhenContext delegates to commands.executeCommand,
            // which the when-context test stubs to observe setContext calls.
            new CustomWhenContext(),
            stubTelemetry as unknown as Telemetry,
            loadStateFile
        ),
    };
}

function stubIsCursor(value: boolean) {
    (HostUtils as any).isCursor = () => value;
}

describe(__filename, () => {
    let originalIsCursor: typeof HostUtils.isCursor;

    beforeEach(() => {
        // Default to plain VS Code; Cursor-specific tests opt in via
        // stubIsCursor(true).
        originalIsCursor = HostUtils.isCursor;
        stubIsCursor(false);
    });

    afterEach(() => {
        (HostUtils as any).isCursor = originalIsCursor;
    });

    it("detects no install when no state file exists", async () => {
        const {manager, stubStateStorage} = setup();
        const location = await manager.detectInstall();
        assert.strictEqual(location, undefined);
        assert.strictEqual(manager.isInstalled, false);
        assert.strictEqual(
            stubStateStorage.get("databricks.aitools.installLocation"),
            undefined
        );
    });

    it("detects a project install", async () => {
        const {manager, stubStateStorage} = setup({project: loadSuccess});
        const location = await manager.detectInstall();
        assert.strictEqual(location, "project");
        assert.strictEqual(manager.isInstalled, true);
        assert.strictEqual(
            stubStateStorage.get("databricks.aitools.installLocation"),
            "project"
        );
    });

    it("detects a global install when only the home state file exists", async () => {
        const {manager, stubStateStorage} = setup({global: loadSuccess});
        const location = await manager.detectInstall();
        assert.strictEqual(location, "global");
        assert.strictEqual(
            stubStateStorage.get("databricks.aitools.installLocation"),
            "global"
        );
    });

    it("prefers project over global when both exist", async () => {
        const {manager} = setup({
            project: loadSuccess,
            global: loadSuccess,
        });
        assert.strictEqual(await manager.detectInstall(), "project");
    });

    it("preserves the cached location on an unexpected detection error", async () => {
        // First, a clean detect that finds a project install.
        const loaders: ScopeLoaders = {project: loadSuccess};
        const {manager, stubStateStorage} = setup(loaders);
        assert.strictEqual(await manager.detectInstall(), "project");
        assert.strictEqual(manager.model.state.detectError ?? false, false);

        // Now the state-file read fails unexpectedly (a non-ENOENT error).
        loaders.project = throwReadError;

        const location = await manager.detectInstall();

        // Location is preserved (not flipped to undefined) and the error flag is set.
        assert.strictEqual(location, "project");
        assert.strictEqual(manager.model.state.installLocation, "project");
        assert.strictEqual(manager.model.state.detectError, true);
        assert.strictEqual(
            stubStateStorage.get("databricks.aitools.installLocation"),
            "project"
        );
    });

    it("clears the detect error flag on a subsequent successful detect", async () => {
        const loaders: ScopeLoaders = {project: loadSuccess};
        const {manager} = setup(loaders);
        await manager.detectInstall();

        // Trigger an unexpected read error, then recover.
        loaders.project = throwReadError;
        await manager.detectInstall();
        assert.strictEqual(manager.model.state.detectError, true);

        // Restore a readable state file; detection should succeed and clear the flag.
        loaders.project = loadSuccess;
        await manager.detectInstall();
        assert.strictEqual(manager.model.state.detectError, false);
        assert.strictEqual(manager.model.state.installLocation, "project");
    });

    it("re-detects and refreshes update status when the active project folder changes", async () => {
        // Nothing installed yet when the manager is constructed.
        const loaders: ScopeLoaders = {};
        const {manager, mockCli, fireActiveFolderChange} = setup(loaders);
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.0.1"},
                },
            ])
        );
        assert.strictEqual(manager.isInstalled, false);

        // Switching to a project that has AI tools installed should re-detect
        // and resolve the update status off the back of the folder change.
        loaders.project = loadSuccess;
        await fireActiveFolderChange(Uri.file(projectDir));

        assert.strictEqual(manager.model.state.installLocation, "project");
        assert.strictEqual(manager.isInstalled, true);
        assert.strictEqual(manager.model.state.updateStatus, "updateAvailable");
    });

    it("reports upToDate when all installed skills match latest", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.updateStatus, "upToDate");
    });

    it("reports updateAvailable when an installed skill is behind latest", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.0.1"},
                },
                {
                    name: "databricks-jobs",
                    latest_version: "0.2.0",
                    installed: {project: "0.2.0"},
                },
            ])
        );
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.updateStatus, "updateAvailable");
    });

    it("ignores non-installed skills when computing update status", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
                {
                    // Not installed (empty installed map) -> must not count as
                    // an available update even though latest > "".
                    name: "databricks-uninstalled",
                    latest_version: "9.9.9",
                    installed: {},
                },
            ])
        );
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.updateStatus, "upToDate");
    });

    it("reports error when the list command fails", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(mockCli.aitoolsList(anything())).thenReject(new Error("boom"));
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.updateStatus, "error");
    });

    it("returns unknown update status when not installed", async () => {
        const {manager, mockCli} = setup();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.updateStatus, "unknown");
        verify(mockCli.aitoolsList(anything())).never();
    });

    it("uninstalls for the detected scope and re-detects", async () => {
        const loaders: ScopeLoaders = {project: loadSuccess};
        const {manager, mockCli, stubStateStorage} = setup(loaders);
        when(
            mockCli.aitoolsUninstall("project", anything(), anything())
        ).thenCall(async () => {
            loaders.project = throwNotFound;
        });
        await manager.detectInstall();
        assert.strictEqual(manager.isInstalled, true);

        await manager.uninstall();

        verify(
            mockCli.aitoolsUninstall("project", anything(), anything())
        ).once();
        assert.strictEqual(manager.isInstalled, false);
        assert.strictEqual(
            stubStateStorage.get("databricks.aitools.installLocation"),
            undefined
        );
    });

    it("toggles the installed when-context on detect and uninstall", async () => {
        const contextValues: Array<boolean> = [];
        const original = commands.executeCommand;
        (commands as any).executeCommand = (
            command: string,
            ...args: any[]
        ) => {
            if (
                command === "setContext" &&
                args[0] === "databricks.context.aitools.installed"
            ) {
                contextValues.push(args[1]);
            }
        };
        try {
            const loaders: ScopeLoaders = {project: loadSuccess};
            const {manager, mockCli} = setup(loaders);
            when(
                mockCli.aitoolsUninstall("project", anything(), anything())
            ).thenCall(async () => {
                loaders.project = throwNotFound;
            });

            await manager.detectInstall();
            await manager.uninstall();

            // Last value must reflect "not installed" after uninstall.
            assert.strictEqual(contextValues.at(-1), false);
            // And it was true at some point (after detecting the install).
            assert.ok(contextValues.includes(true));
        } finally {
            (commands as any).executeCommand = original;
        }
    });

    it("does not call the CLI when uninstalling with nothing installed", async () => {
        const {manager, mockCli} = setup();
        await manager.detectInstall();
        await manager.uninstall();
        verify(
            mockCli.aitoolsUninstall(anything(), anything(), anything())
        ).never();
    });

    it("detects install and refreshes status after a global install", async () => {
        const loaders: ScopeLoaders = {};
        const {manager, mockCli} = setup(loaders);
        when(
            mockCli.aitoolsInstall("global", anything(), anything(), anything())
        ).thenCall(async () => {
            loaders.global = loadSuccess;
        });
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {global: "0.1.0"},
                },
            ])
        );

        await manager.install("global", "initModal", ["claude-code"]);

        verify(
            mockCli.aitoolsInstall("global", anything(), anything(), anything())
        ).once();
        assert.strictEqual(manager.model.state.installLocation, "global");
        assert.strictEqual(manager.model.state.updateStatus, "upToDate");
    });

    describe("Cursor install flow", () => {
        let originalExecuteCommand: typeof commands.executeCommand;
        let executed: Array<{command: string; args: any[]}>;

        beforeEach(() => {
            stubIsCursor(true);
            originalExecuteCommand = commands.executeCommand;
            executed = [];
            (commands as any).executeCommand = async (
                command: string,
                ...args: any[]
            ) => {
                executed.push({command, args});
            };
        });

        afterEach(() => {
            (commands as any).executeCommand = originalExecuteCommand;
        });

        function openedCursorPlugin() {
            return executed.some(
                (e) => e.command === "workbench.action.openMarketplaceEditor"
            );
        }

        it("opens the plugin modal and strips cursor from the CLI --agents", async () => {
            const {manager, mockCli, stubTelemetry} = setup({
                project: loadSuccess,
            });
            when(
                mockCli.aitoolsInstall(
                    "project",
                    anything(),
                    anything(),
                    anything()
                )
            ).thenResolve();
            when(mockCli.aitoolsList(anything())).thenResolve(
                listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: "0.1.0"},
                    },
                ])
            );

            await manager.install("project", "sidePane", [
                "claude-code",
                CURSOR_AGENT_ID,
            ]);

            assert.ok(
                openedCursorPlugin(),
                "expected the plugin modal to open"
            );
            const [, , , cliAgents] = capture(mockCli.aitoolsInstall).last();
            // cursor is never passed to the CLI; the rest are.
            assert.deepStrictEqual(cliAgents, ["claude-code"]);

            // The install event records only the CLI agents (cursor stripped)
            // and flags the plugin separately.
            const [installEvent] = stubTelemetry.eventsOfType(
                Events.AITOOLS_INSTALL
            );
            assert.deepStrictEqual(installEvent.props.agents, ["claude-code"]);
            assert.strictEqual(installEvent.props.cursorPlugin, true);
            // Prompting the plugin is recorded too, inheriting the install's
            // source.
            const [pluginEvent] = stubTelemetry.eventsOfType(
                Events.AITOOLS_CURSOR_PLUGIN_PROMPT
            );
            assert.strictEqual(pluginEvent.props.success, true);
            assert.strictEqual(pluginEvent.props.source, "sidePane");
        });

        it("skips the CLI install when only the Cursor plugin is selected", async () => {
            const {manager, mockCli, stubTelemetry} = setup({
                project: loadSuccess,
            });

            await manager.install("project", "sidePane", [CURSOR_AGENT_ID]);

            assert.ok(
                openedCursorPlugin(),
                "expected the plugin modal to open"
            );
            // No skills to install via the CLI -> the CLI is not invoked (an
            // empty --agents would wrongly act on every detected agent).
            verify(
                mockCli.aitoolsInstall(
                    anything(),
                    anything(),
                    anything(),
                    anything()
                )
            ).never();

            // The plugin-only install is still recorded, with no CLI agents.
            const [installEvent] = stubTelemetry.eventsOfType(
                Events.AITOOLS_INSTALL
            );
            assert.ok(installEvent, "expected an install event");
            // The plugin install isn't observable by the extension, so the
            // outcome is a possible success, not a confirmed one.
            assert.strictEqual(installEvent.props.result, "possible-success");
            assert.deepStrictEqual(installEvent.props.agents, []);
            assert.strictEqual(installEvent.props.cursorPlugin, true);
        });

        it("does not open the plugin modal when cursor is not selected", async () => {
            const {manager, mockCli} = setup({project: loadSuccess});
            when(
                mockCli.aitoolsInstall(
                    "project",
                    anything(),
                    anything(),
                    anything()
                )
            ).thenResolve();
            when(mockCli.aitoolsList(anything())).thenResolve(
                listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: "0.1.0"},
                    },
                ])
            );

            await manager.install("project", "sidePane", ["claude-code"]);

            assert.ok(
                !openedCursorPlugin(),
                "did not expect the plugin modal to open"
            );
            const [, , , cliAgents] = capture(mockCli.aitoolsInstall).last();
            assert.deepStrictEqual(cliAgents, ["claude-code"]);
        });
    });

    describe("addCursorPlugin", () => {
        let originalExecuteCommand: typeof commands.executeCommand;

        afterEach(() => {
            (commands as any).executeCommand = originalExecuteCommand;
        });

        it("records a successful plugin prompt with the given source", async () => {
            originalExecuteCommand = commands.executeCommand;
            (commands as any).executeCommand = async () => {};
            const {manager, stubTelemetry} = setup();

            await manager.addCursorPlugin("pluginButton");

            const [pluginEvent] = stubTelemetry.eventsOfType(
                Events.AITOOLS_CURSOR_PLUGIN_PROMPT
            );
            assert.strictEqual(pluginEvent.props.success, true);
            assert.strictEqual(pluginEvent.props.source, "pluginButton");
        });

        it("records a failed plugin prompt when opening the modal throws", async () => {
            originalExecuteCommand = commands.executeCommand;
            (commands as any).executeCommand = async (command: string) => {
                // Only the marketplace modal fails; setContext etc. are no-ops.
                if (command === "workbench.action.openMarketplaceEditor") {
                    throw new Error("no marketplace");
                }
            };
            const {manager, stubTelemetry} = setup();

            await manager.addCursorPlugin();

            assert.deepStrictEqual(
                stubTelemetry
                    .eventsOfType(Events.AITOOLS_CURSOR_PLUGIN_PROMPT)
                    .map((e) => e.props.success),
                [false]
            );
        });
    });

    it("installs a single agent into the current scope and refreshes status", async () => {
        const {manager, mockCli, stubTelemetry} = setup({project: loadSuccess});
        when(
            mockCli.aitoolsInstall(
                "project",
                anything(),
                anything(),
                anything()
            )
        ).thenResolve();
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        await manager.detectInstall();

        await manager.installAgent("codex");

        const [scope, , , agents] = capture(mockCli.aitoolsInstall).last();
        assert.strictEqual(scope, "project");
        assert.deepStrictEqual(agents, ["codex"]);
        verify(mockCli.aitoolsList(anything())).once();

        // The install event records which agent was installed.
        const [installEvent] = stubTelemetry.eventsOfType(
            Events.AITOOLS_INSTALL
        );
        assert.strictEqual(installEvent.props.result, "success");
        assert.strictEqual(installEvent.props.source, "sidePane");
        assert.deepStrictEqual(installEvent.props.agents, ["codex"]);
    });

    it("does not install an agent when nothing is installed", async () => {
        const {manager, mockCli} = setup();
        await manager.detectInstall();

        await manager.installAgent("codex");

        verify(
            mockCli.aitoolsInstall(
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).never();
    });

    it("still refreshes the panel when a single-agent install fails", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        // A partial install (e.g. an agent whose CLI is missing) often still
        // installed some tools, so the panel must reconcile with the real state
        // rather than staying stale. The error is rethrown for the command layer
        // to surface.
        when(
            mockCli.aitoolsInstall(
                "project",
                anything(),
                anything(),
                anything()
            )
        ).thenReject(new ProcessError("boom", 1));
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        await manager.detectInstall();

        await assert.rejects(() => manager.installAgent("codex"), ProcessError);

        // resolveInstalled ran despite the failure.
        verify(mockCli.aitoolsList(anything())).once();
        assert.strictEqual(manager.model.state.updateStatus, "upToDate");
    });

    it("still refreshes the panel when the install command fails", async () => {
        const loaders: ScopeLoaders = {};
        const {manager, mockCli, stubTelemetry} = setup(loaders);
        when(
            mockCli.aitoolsInstall("global", anything(), anything(), anything())
        ).thenCall(async () => {
            // Simulate a partial install: some tools landed before the failure.
            loaders.global = loadSuccess;
            throw new ProcessError("boom", 1);
        });
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {global: "0.1.0"},
                },
            ])
        );

        await assert.rejects(
            () => manager.install("global", "sidePane", ["codex"]),
            ProcessError
        );

        // detectInstall + resolveInstalled ran despite the failure, so the row
        // reflects the tools that actually installed.
        assert.strictEqual(manager.model.state.installLocation, "global");
        assert.strictEqual(manager.model.state.updateStatus, "upToDate");

        // The failed install is recorded as an error outcome.
        const [installEvent] = stubTelemetry.eventsOfType(
            Events.AITOOLS_INSTALL
        );
        assert.strictEqual(installEvent.props.result, "error");
    });

    it("refreshes update status to upToDate after a successful update", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(
            mockCli.aitoolsUpdate("project", anything(), anything())
        ).thenResolve();
        // After the update, list reports everything at the latest version.
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        await manager.detectInstall();

        await manager.update();

        assert.strictEqual(manager.model.state.updateStatus, "upToDate");
        verify(mockCli.aitoolsList(anything())).once();
    });

    it("still refreshes update status when the update command fails", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(
            mockCli.aitoolsUpdate("project", anything(), anything())
        ).thenReject(new ProcessError("boom", 1));
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.0.1"},
                },
            ])
        );
        await manager.detectInstall();

        await assert.rejects(() => manager.update(), ProcessError);

        // The finally block reconciles state even though the update errored.
        assert.strictEqual(manager.model.state.updateStatus, "updateAvailable");
        verify(mockCli.aitoolsList(anything())).once();
    });

    it("serializes a concurrent resolveInstalled behind an in-flight update", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        // Hold the update CLI call open so we can fire a concurrent
        // "check for updates" (resolveInstalled) while update() is still
        // in-flight, then release it.
        let releaseUpdate!: () => void;
        const updateGate = new Promise<void>((resolve) => {
            releaseUpdate = resolve;
        });
        when(
            mockCli.aitoolsUpdate("project", anything(), anything())
        ).thenReturn(updateGate);
        // Both the update's reconciliation and the concurrent check use list;
        // report everything up to date.
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        await manager.detectInstall();

        const updatePromise = manager.update();
        // Kick off the concurrent check while update is blocked on the CLI. The
        // mutex must queue it until update() (including its reconciliation)
        // completes, so it can't strand the row on "checking".
        const checkPromise = manager.resolveInstalled();

        // Let update()'s body run (it's now past the mutex's await boundary and
        // blocked on the CLI gate). The queued check is still waiting on the
        // mutex, so the row reflects the update in progress — not the check's
        // "checking". Without serialization the check would run concurrently and
        // have already overwritten this.
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.strictEqual(manager.model.state.updateStatus, "updating");

        releaseUpdate();
        await Promise.all([updatePromise, checkPromise]);

        // The check ran after the update fully reconciled, so the final state is
        // the resolved "upToDate" rather than a stranded "checking".
        assert.strictEqual(manager.model.state.updateStatus, "upToDate");
    });

    it("captures the installed release version from list", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(mockCli.aitoolsList(anything())).thenResolve({
            release: "0.3.1",
            skills: [
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    experimental: false,
                    installed: {project: "0.1.0"},
                },
            ],
            agents: [],
        });
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.version, "0.3.1");
    });

    it("flags a managed agent delivered as skills only", async () => {
        const {manager, mockCli} = setup({project: loadSuccess});
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult(
                [
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: "0.1.0"},
                    },
                ],
                [
                    {
                        name: "claude-code",
                        display_name: "Claude Code",
                        managed: true,
                        detected: true,
                        installed: {
                            project: {
                                version: "1.2.0",
                                native_scope: "project",
                                delivery: "skills",
                            },
                        },
                    },
                    {
                        name: "codex",
                        display_name: "Codex",
                        managed: true,
                        detected: true,
                        installed: {
                            project: {
                                version: "1.2.0",
                                native_scope: "project",
                                delivery: "plugin",
                            },
                        },
                    },
                    {
                        name: "windsurf",
                        display_name: "Windsurf",
                        managed: false,
                        detected: true,
                        installed: {
                            project: {
                                version: "1.2.0",
                                native_scope: "project",
                                delivery: "skills",
                            },
                        },
                    },
                ]
            )
        );
        await manager.detectInstall();
        await manager.resolveInstalled();

        const {agents} = manager.model.state;
        // Managed + delivered as skills -> flagged.
        assert.strictEqual(agents[0].skillsOnly, true);
        // Managed but delivered as the plugin -> not flagged.
        assert.strictEqual(agents[1].skillsOnly, false);
        // Unmanaged agents are never flagged, even when delivered as skills.
        assert.strictEqual(agents[2].skillsOnly, false);
    });

    it("clears the version when nothing is installed", async () => {
        const loaders: ScopeLoaders = {project: loadSuccess};
        const {manager, mockCli} = setup(loaders);
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.model.state.version, "0.2.9");

        // Uninstalling / re-detecting with no state file clears the version.
        loaders.project = throwNotFound;
        await manager.detectInstall();
        assert.strictEqual(manager.model.state.version, undefined);
    });

    describe("no open folder", () => {
        // Like setup(), but with no active workspace folder: activeProjectUri
        // throws, mirroring WorkspaceFolderManager when no folder is active.
        function setupNoFolder(loaders: ScopeLoaders = {}) {
            const s = setup(loaders);
            when(s.mockWorkspaceFolderManager.activeProjectUri).thenThrow(
                new Error("No active project folder")
            );
            return s;
        }

        it("reports no project folder", () => {
            assert.strictEqual(setupNoFolder().manager.hasProjectFolder, false);
        });

        it("installs global against the home dir without touching projectRoot", async () => {
            const loaders: ScopeLoaders = {};
            const {manager, mockCli} = setupNoFolder(loaders);
            when(
                mockCli.aitoolsInstall(
                    "global",
                    anything(),
                    anything(),
                    anything()
                )
            ).thenCall(async () => {
                loaders.global = loadSuccess;
            });
            when(mockCli.aitoolsList(anything())).thenResolve(
                listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {global: "0.1.0"},
                    },
                ])
            );

            // Must not throw even though no folder is open.
            await manager.install("global", "initModal", ["codex"]);

            verify(
                mockCli.aitoolsInstall(
                    "global",
                    homeDir,
                    anything(),
                    anything()
                )
            ).once();
            assert.strictEqual(manager.model.state.installLocation, "global");
        });

        it("detects a global install with no folder open", async () => {
            const {manager} = setupNoFolder({global: loadSuccess});
            assert.strictEqual(await manager.detectInstall(), "global");
        });
    });

    describe("initialize", () => {
        it("resolves the update status but reports 'update' when installed and behind", async () => {
            const {manager, mockCli} = setup({project: loadSuccess});
            when(mockCli.aitoolsList(anything())).thenResolve(
                listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: "0.0.1"},
                    },
                ])
            );

            const action = await manager.initialize();

            // initialize resolves status but leaves applying the update to the
            // caller (AiToolsCommands).
            assert.strictEqual(action, "update");
            assert.strictEqual(
                manager.model.state.updateStatus,
                "updateAvailable"
            );
            verify(
                mockCli.aitoolsUpdate(anything(), anything(), anything())
            ).never();
        });

        it("reports 'none' when installed and up to date", async () => {
            const {manager, mockCli} = setup({project: loadSuccess});
            when(mockCli.aitoolsList(anything())).thenResolve(
                listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: "0.1.0"},
                    },
                ])
            );

            assert.strictEqual(await manager.initialize(), "none");
        });

        it("reports 'promptInstall' when not installed", async () => {
            const {manager} = setup();

            assert.strictEqual(await manager.initialize(), "promptInstall");
        });

        it("reports 'none' when not installed but opted out", async () => {
            const {manager, stubStateStorage} = setup();
            stubStateStorage.set("databricks.aitools.hideInstallPrompt", true);

            assert.strictEqual(await manager.initialize(), "none");
        });

        it("records the opt-out via optOutOfInstallPrompt", async () => {
            const {manager, stubStateStorage} = setup();
            assert.strictEqual(manager.shouldPromptInstall, true);

            await manager.optOutOfInstallPrompt();

            assert.strictEqual(
                stubStateStorage.get("databricks.aitools.hideInstallPrompt"),
                true
            );
            assert.strictEqual(manager.shouldPromptInstall, false);
        });
    });
});
