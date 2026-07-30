/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    anything,
    capture,
    instance,
    mock,
    reset,
    verify,
    when,
} from "ts-mockito";
import {commands, Uri, window} from "vscode";
import {mkdtemp, mkdir, writeFile, rm} from "fs/promises";
import path from "path";
import os from "os";
import {
    AiToolsAgent,
    AiToolsListResult,
    CliWrapper,
    ProcessError,
} from "../cli/CliWrapper";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import {AiToolsManager, CURSOR_AGENT_ID} from "./AiToolsManager";
import {HostUtils} from "../utils";

const STATE_FILE_RELATIVE_PATH = path.join(
    ".databricks",
    "aitools",
    "skills",
    ".state.json"
);

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

describe(__filename, () => {
    let mockCli: CliWrapper;
    let mockWorkspaceFolderManager: WorkspaceFolderManager;
    let telemetry: Telemetry;
    let storedState: Record<string, any>;
    let stubStateStorage: StateStorage;

    let projectDir: string;
    let homeDir: string;
    let originalHome: string | undefined;
    let originalIsCursor: typeof HostUtils.isCursor;
    // Every telemetry event recorded during a test (via start()'s recorder or a
    // direct recordEvent), so assertions can inspect the emitted properties.
    let recordedEvents: Array<{event: string; props: any}>;

    function eventsOfType(event: string) {
        return recordedEvents.filter((e) => e.event === event);
    }

    function stubIsCursor(value: boolean) {
        (HostUtils as any).isCursor = () => value;
    }

    async function writeStateFile(root: string) {
        const dir = path.join(root, path.dirname(STATE_FILE_RELATIVE_PATH));
        await mkdir(dir, {recursive: true});
        await writeFile(
            path.join(root, STATE_FILE_RELATIVE_PATH),
            JSON.stringify({schema_version: 1, release: "v0.2.9", skills: {}})
        );
    }

    beforeEach(async () => {
        projectDir = await mkdtemp(path.join(os.tmpdir(), "aitools-proj-"));
        homeDir = await mkdtemp(path.join(os.tmpdir(), "aitools-home-"));
        originalHome = process.env.HOME;
        process.env.HOME = homeDir;

        storedState = {};
        stubStateStorage = {
            get: (key: string) => storedState[key],
            set: async (key: string, value: any) => {
                storedState[key] = value;
            },
            onDidChange: () => ({dispose() {}}),
        } as unknown as StateStorage;

        mockCli = mock(CliWrapper);
        mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
        when(mockWorkspaceFolderManager.activeProjectUri).thenReturn(
            Uri.file(projectDir)
        );
        // Capture recorded events. start() returns a recorder callback that
        // records under the event name; recordEvent records directly.
        recordedEvents = [];
        telemetry = {
            start: (event: string) => (props: any) => {
                recordedEvents.push({event, props});
            },
            recordEvent: (event: string, props: any) => {
                recordedEvents.push({event, props});
            },
        } as unknown as Telemetry;

        // Default to plain VS Code; Cursor-specific tests opt in via
        // stubIsCursor(true).
        originalIsCursor = HostUtils.isCursor;
        stubIsCursor(false);
    });

    afterEach(async () => {
        process.env.HOME = originalHome;
        (HostUtils as any).isCursor = originalIsCursor;
        reset(mockCli);
        reset(mockWorkspaceFolderManager);
        await rm(projectDir, {recursive: true, force: true});
        await rm(homeDir, {recursive: true, force: true});
    });

    function createManager() {
        return new AiToolsManager(
            instance(mockCli),
            stubStateStorage,
            instance(mockWorkspaceFolderManager),
            telemetry
        );
    }

    it("detects no install when no state file exists", async () => {
        const manager = createManager();
        const location = await manager.detectInstall();
        assert.strictEqual(location, undefined);
        assert.strictEqual(manager.isInstalled, false);
        assert.strictEqual(
            storedState["databricks.aitools.installLocation"],
            undefined
        );
    });

    it("detects a project install", async () => {
        await writeStateFile(projectDir);
        const manager = createManager();
        const location = await manager.detectInstall();
        assert.strictEqual(location, "project");
        assert.strictEqual(manager.isInstalled, true);
        assert.strictEqual(
            storedState["databricks.aitools.installLocation"],
            "project"
        );
    });

    it("detects a global install when only the home state file exists", async () => {
        await writeStateFile(homeDir);
        const manager = createManager();
        const location = await manager.detectInstall();
        assert.strictEqual(location, "global");
        assert.strictEqual(
            storedState["databricks.aitools.installLocation"],
            "global"
        );
    });

    it("prefers project over global when both exist", async () => {
        await writeStateFile(projectDir);
        await writeStateFile(homeDir);
        const manager = createManager();
        assert.strictEqual(await manager.detectInstall(), "project");
    });

    it("preserves the cached location on an unexpected detection error", async () => {
        // First, a clean detect that finds a project install.
        await writeStateFile(projectDir);
        const manager = createManager();
        assert.strictEqual(await manager.detectInstall(), "project");
        assert.strictEqual(manager.state.detectError ?? false, false);

        // Now make the state file unreadable as a file: replace it with a
        // directory so readFile throws EISDIR (a non-ENOENT error).
        await rm(path.join(projectDir, STATE_FILE_RELATIVE_PATH), {
            force: true,
        });
        await mkdir(path.join(projectDir, STATE_FILE_RELATIVE_PATH));

        const location = await manager.detectInstall();

        // Location is preserved (not flipped to undefined) and the error flag is set.
        assert.strictEqual(location, "project");
        assert.strictEqual(manager.state.installLocation, "project");
        assert.strictEqual(manager.state.detectError, true);
        assert.strictEqual(
            storedState["databricks.aitools.installLocation"],
            "project"
        );
    });

    it("clears the detect error flag on a subsequent successful detect", async () => {
        await writeStateFile(projectDir);
        const manager = createManager();
        await manager.detectInstall();

        // Trigger an error (state file is a directory), then recover.
        await rm(path.join(projectDir, STATE_FILE_RELATIVE_PATH), {
            force: true,
        });
        await mkdir(path.join(projectDir, STATE_FILE_RELATIVE_PATH));
        await manager.detectInstall();
        assert.strictEqual(manager.state.detectError, true);

        // Restore a real state file; detection should succeed and clear the flag.
        await rm(path.join(projectDir, STATE_FILE_RELATIVE_PATH), {
            recursive: true,
            force: true,
        });
        await writeStateFile(projectDir);
        await manager.detectInstall();
        assert.strictEqual(manager.state.detectError, false);
        assert.strictEqual(manager.state.installLocation, "project");
    });

    it("reports upToDate when all installed skills match latest", async () => {
        await writeStateFile(projectDir);
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.updateStatus, "upToDate");
    });

    it("reports updateAvailable when an installed skill is behind latest", async () => {
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.updateStatus, "updateAvailable");
    });

    it("ignores non-installed skills when computing update status", async () => {
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.updateStatus, "upToDate");
    });

    it("reports error when the list command fails", async () => {
        await writeStateFile(projectDir);
        when(mockCli.aitoolsList(anything())).thenReject(new Error("boom"));
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.updateStatus, "error");
    });

    it("returns unknown update status when not installed", async () => {
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.updateStatus, "unknown");
        verify(mockCli.aitoolsList(anything())).never();
    });

    it("uninstalls for the detected scope and re-detects", async () => {
        await writeStateFile(projectDir);
        when(
            mockCli.aitoolsUninstall("project", anything(), anything())
        ).thenCall(async () => {
            await rm(path.join(projectDir, STATE_FILE_RELATIVE_PATH), {
                force: true,
            });
        });
        const manager = createManager();
        await manager.detectInstall();
        assert.strictEqual(manager.isInstalled, true);

        await manager.uninstall();

        verify(
            mockCli.aitoolsUninstall("project", anything(), anything())
        ).once();
        assert.strictEqual(manager.isInstalled, false);
        assert.strictEqual(
            storedState["databricks.aitools.installLocation"],
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
            await writeStateFile(projectDir);
            when(
                mockCli.aitoolsUninstall("project", anything(), anything())
            ).thenCall(async () => {
                await rm(path.join(projectDir, STATE_FILE_RELATIVE_PATH), {
                    force: true,
                });
            });
            const manager = createManager();

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
        const manager = createManager();
        await manager.detectInstall();
        await manager.uninstall();
        verify(
            mockCli.aitoolsUninstall(anything(), anything(), anything())
        ).never();
    });

    it("detects install and refreshes status after a global install", async () => {
        when(
            mockCli.aitoolsInstall("global", anything(), anything(), anything())
        ).thenCall(async () => {
            await writeStateFile(homeDir);
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
        const manager = createManager();

        await manager.install("global");

        verify(
            mockCli.aitoolsInstall("global", anything(), anything(), anything())
        ).once();
        assert.strictEqual(manager.state.installLocation, "global");
        assert.strictEqual(manager.state.updateStatus, "upToDate");
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
            await writeStateFile(projectDir);
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
            const manager = createManager();

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
            const [installEvent] = eventsOfType(Events.AITOOLS_INSTALL);
            assert.deepStrictEqual(installEvent.props.agents, ["claude-code"]);
            assert.strictEqual(installEvent.props.cursorPlugin, true);
            // Prompting the plugin is recorded too, inheriting the install's
            // source.
            const [pluginEvent] = eventsOfType(
                Events.AITOOLS_CURSOR_PLUGIN_PROMPT
            );
            assert.strictEqual(pluginEvent.props.success, true);
            assert.strictEqual(pluginEvent.props.source, "sidePane");
        });

        it("skips the CLI install when only the Cursor plugin is selected", async () => {
            await writeStateFile(projectDir);
            const manager = createManager();

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
            const [installEvent] = eventsOfType(Events.AITOOLS_INSTALL);
            assert.ok(installEvent, "expected an install event");
            assert.strictEqual(installEvent.props.success, true);
            assert.deepStrictEqual(installEvent.props.agents, []);
            assert.strictEqual(installEvent.props.cursorPlugin, true);
        });

        it("does not open the plugin modal when cursor is not selected", async () => {
            await writeStateFile(projectDir);
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
            const manager = createManager();

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
            const manager = createManager();

            await manager.addCursorPlugin("pluginButton");

            const [pluginEvent] = eventsOfType(
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
            const manager = createManager();

            await manager.addCursorPlugin();

            assert.deepStrictEqual(
                eventsOfType(Events.AITOOLS_CURSOR_PLUGIN_PROMPT).map(
                    (e) => e.props.success
                ),
                [false]
            );
        });
    });

    it("installs a single agent into the current scope and refreshes status", async () => {
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();

        await manager.installAgent("codex");

        const [scope, , , agents] = capture(mockCli.aitoolsInstall).last();
        assert.strictEqual(scope, "project");
        assert.deepStrictEqual(agents, ["codex"]);
        verify(mockCli.aitoolsList(anything())).once();

        // The install event records which agent was installed.
        const [installEvent] = eventsOfType(Events.AITOOLS_INSTALL);
        assert.strictEqual(installEvent.props.success, true);
        assert.strictEqual(installEvent.props.source, "sidePane");
        assert.deepStrictEqual(installEvent.props.agents, ["codex"]);
    });

    it("does not install an agent when nothing is installed", async () => {
        const manager = createManager();
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
        // A partial install (e.g. an agent whose CLI is missing) often still
        // installed some tools, so the panel must reconcile with the real state
        // rather than staying stale.
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();

        await manager.installAgent("codex");

        // resolveInstalled ran despite the failure.
        verify(mockCli.aitoolsList(anything())).once();
        assert.strictEqual(manager.state.updateStatus, "upToDate");
    });

    it("still refreshes the panel when the install command fails", async () => {
        when(
            mockCli.aitoolsInstall("global", anything(), anything(), anything())
        ).thenCall(async () => {
            // Simulate a partial install: some tools landed before the failure.
            await writeStateFile(homeDir);
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
        const manager = createManager();

        await manager.install("global", "sidePane", ["codex"]);

        // detectInstall + resolveInstalled ran despite the failure, so the row
        // reflects the tools that actually installed.
        assert.strictEqual(manager.state.installLocation, "global");
        assert.strictEqual(manager.state.updateStatus, "upToDate");
    });

    it("refreshes update status to upToDate after a successful update", async () => {
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();

        await manager.update();

        assert.strictEqual(manager.state.updateStatus, "upToDate");
        verify(mockCli.aitoolsList(anything())).once();
    });

    it("still refreshes update status when the update command fails", async () => {
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();

        await manager.update();

        // The finally block reconciles state even though the update errored.
        assert.strictEqual(manager.state.updateStatus, "updateAvailable");
        verify(mockCli.aitoolsList(anything())).once();
    });

    it("captures the installed release version from list", async () => {
        await writeStateFile(projectDir);
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
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.version, "0.3.1");
    });

    it("clears the version when nothing is installed", async () => {
        await writeStateFile(projectDir);
        when(mockCli.aitoolsList(anything())).thenResolve(
            listResult([
                {
                    name: "databricks-core",
                    latest_version: "0.1.0",
                    installed: {project: "0.1.0"},
                },
            ])
        );
        const manager = createManager();
        await manager.detectInstall();
        await manager.resolveInstalled();
        assert.strictEqual(manager.state.version, "0.2.9");

        // Uninstalling / re-detecting with no state file clears the version.
        await rm(path.join(projectDir, STATE_FILE_RELATIVE_PATH), {
            force: true,
        });
        await manager.detectInstall();
        assert.strictEqual(manager.state.version, undefined);
    });

    describe("no open folder", () => {
        beforeEach(() => {
            // Mirror WorkspaceFolderManager throwing when no folder is active.
            when(mockWorkspaceFolderManager.activeProjectUri).thenThrow(
                new Error("No active project folder")
            );
        });

        it("reports no project folder", () => {
            assert.strictEqual(createManager().hasProjectFolder, false);
        });

        it("installs global against the home dir without touching projectRoot", async () => {
            when(
                mockCli.aitoolsInstall(
                    "global",
                    anything(),
                    anything(),
                    anything()
                )
            ).thenCall(async () => {
                await writeStateFile(homeDir);
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
            const manager = createManager();

            // Must not throw even though no folder is open.
            await manager.install("global");

            verify(
                mockCli.aitoolsInstall(
                    "global",
                    homeDir,
                    anything(),
                    anything()
                )
            ).once();
            assert.strictEqual(manager.state.installLocation, "global");
        });

        it("detects a global install with no folder open", async () => {
            await writeStateFile(homeDir);
            const manager = createManager();
            assert.strictEqual(await manager.detectInstall(), "global");
        });
    });

    describe("initialize", () => {
        let originalExecuteCommand: typeof commands.executeCommand;
        let originalShowInfo: typeof window.showInformationMessage;
        let executed: Array<{command: string; args: any[]}>;

        beforeEach(() => {
            originalExecuteCommand = commands.executeCommand;
            originalShowInfo = window.showInformationMessage;
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
            (window as any).showInformationMessage = originalShowInfo;
        });

        it("auto-applies an available update when installed", async () => {
            await writeStateFile(projectDir);
            when(
                mockCli.aitoolsUpdate("project", anything(), anything())
            ).thenResolve();
            let call = 0;
            when(mockCli.aitoolsList(anything())).thenCall(async () => {
                call++;
                // First check: behind latest. After update: up to date.
                return listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: call === 1 ? "0.0.1" : "0.1.0"},
                    },
                ]);
            });
            const manager = createManager();

            await manager.initialize();

            verify(
                mockCli.aitoolsUpdate("project", anything(), anything())
            ).once();
            assert.strictEqual(manager.state.updateStatus, "upToDate");
        });

        it("does not update when already up to date", async () => {
            await writeStateFile(projectDir);
            when(mockCli.aitoolsList(anything())).thenResolve(
                listResult([
                    {
                        name: "databricks-core",
                        latest_version: "0.1.0",
                        installed: {project: "0.1.0"},
                    },
                ])
            );
            const manager = createManager();

            await manager.initialize();

            verify(
                mockCli.aitoolsUpdate(anything(), anything(), anything())
            ).never();
        });

        it("prompts to install and runs the install command on accept", async () => {
            (window as any).showInformationMessage = async () =>
                "Install AI tools";
            const manager = createManager();

            await manager.initialize();

            assert.ok(
                executed.some((e) => e.command === "databricks.aitools.install")
            );
            // Accepting the install must not set the opt-out flag.
            assert.notStrictEqual(
                storedState["databricks.aitools.hideInstallPrompt"],
                true
            );
        });

        it("does not opt out when the prompt is merely dismissed", async () => {
            (window as any).showInformationMessage = async () => undefined;
            const manager = createManager();

            await manager.initialize();

            assert.ok(
                !executed.some(
                    (e) => e.command === "databricks.aitools.install"
                )
            );
            // A plain dismissal leaves the prompt eligible to reappear.
            assert.notStrictEqual(
                storedState["databricks.aitools.hideInstallPrompt"],
                true
            );
        });

        it("opts out permanently when the user picks 'Don't show again'", async () => {
            (window as any).showInformationMessage = async () =>
                "Don't show again";
            const manager = createManager();

            await manager.initialize();

            assert.ok(
                !executed.some(
                    (e) => e.command === "databricks.aitools.install"
                )
            );
            assert.strictEqual(
                storedState["databricks.aitools.hideInstallPrompt"],
                true
            );
        });

        it("does not prompt again once opted out", async () => {
            storedState["databricks.aitools.hideInstallPrompt"] = true;
            let prompted = false;
            (window as any).showInformationMessage = async () => {
                prompted = true;
                return undefined;
            };
            const manager = createManager();

            await manager.initialize();

            assert.strictEqual(prompted, false);
        });
    });
});
