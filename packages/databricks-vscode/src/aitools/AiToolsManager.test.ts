/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {anything, instance, mock, reset, verify, when} from "ts-mockito";
import {commands, Uri, window} from "vscode";
import {mkdtemp, mkdir, writeFile, rm} from "fs/promises";
import path from "path";
import os from "os";
import {AiToolsListResult, CliWrapper, ProcessError} from "../cli/CliWrapper";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {Telemetry} from "../telemetry";
import {AiToolsManager} from "./AiToolsManager";

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
    }>
): AiToolsListResult {
    return {
        release: "0.2.9",
        skills: skills.map((s) => ({
            experimental: false,
            ...s,
        })),
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
        // start() returns a recorder callback; stub it to a no-op so the
        // manager's install/update/uninstall telemetry calls work.
        telemetry = {
            start: () => () => {},
        } as unknown as Telemetry;
    });

    afterEach(async () => {
        process.env.HOME = originalHome;
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
        const status = await manager.checkForUpdates();
        assert.strictEqual(status, "upToDate");
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
        assert.strictEqual(await manager.checkForUpdates(), "updateAvailable");
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
        assert.strictEqual(await manager.checkForUpdates(), "upToDate");
    });

    it("reports error when the list command fails", async () => {
        await writeStateFile(projectDir);
        when(mockCli.aitoolsList(anything())).thenReject(new Error("boom"));
        const manager = createManager();
        await manager.detectInstall();
        assert.strictEqual(await manager.checkForUpdates(), "error");
    });

    it("returns unknown update status when not installed", async () => {
        const manager = createManager();
        await manager.detectInstall();
        const status = await manager.checkForUpdates();
        assert.strictEqual(status, "unknown");
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

    it("clears the Cursor plugin flag on uninstall so it is re-offered", async () => {
        await writeStateFile(projectDir);
        storedState["databricks.aitools.cursorPluginPrompted"] = true;
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

        assert.strictEqual(
            storedState["databricks.aitools.cursorPluginPrompted"],
            false
        );
    });

    it("does not clear the Cursor plugin flag when uninstall fails", async () => {
        await writeStateFile(projectDir);
        storedState["databricks.aitools.cursorPluginPrompted"] = true;
        when(
            mockCli.aitoolsUninstall("project", anything(), anything())
        ).thenReject(new ProcessError("boom", 1));
        const manager = createManager();
        await manager.detectInstall();

        await manager.uninstall();

        // The state file still exists (uninstall failed), so the flag must be
        // left untouched.
        assert.strictEqual(
            storedState["databricks.aitools.cursorPluginPrompted"],
            true
        );
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
        when(mockCli.aitoolsInstall("global", anything(), anything())).thenCall(
            async () => {
                await writeStateFile(homeDir);
            }
        );
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

        verify(mockCli.aitoolsInstall("global", anything(), anything())).once();
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
        });
        const manager = createManager();
        await manager.detectInstall();
        await manager.checkForUpdates();
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
        await manager.checkForUpdates();
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
                mockCli.aitoolsInstall("global", anything(), anything())
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
                mockCli.aitoolsInstall("global", homeDir, anything())
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
            assert.strictEqual(
                storedState["databricks.aitools.installPrompted"],
                true
            );
        });

        it("does not install when the prompt is dismissed", async () => {
            (window as any).showInformationMessage = async () => undefined;
            const manager = createManager();

            await manager.initialize();

            assert.ok(
                !executed.some(
                    (e) => e.command === "databricks.aitools.install"
                )
            );
            assert.strictEqual(
                storedState["databricks.aitools.installPrompted"],
                true
            );
        });

        it("does not prompt again once prompted", async () => {
            storedState["databricks.aitools.installPrompted"] = true;
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
