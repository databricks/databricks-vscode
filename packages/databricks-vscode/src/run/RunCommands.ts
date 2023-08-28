import {commands, debug, Progress, ProgressLocation, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {promptForAttachingSyncDest} from "./prompts";
import {FileUtils} from "../utils";
import {LocalUri} from "../sync/SyncDestination";

import *  as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'

type ConnectProgress = { completed: number, total: number }

/**
 * Run related commands
 */
export class RunCommands {
    constructor(private connection: ConnectionManager) {}

    /**
     * Run a Python file using the command execution API
     */
    runEditorContentsCommand() {
        return async (resource: Uri) => {
            const targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (await FileUtils.isNotebook(new LocalUri(targetResource))) {
                    await window.showErrorMessage(
                        'Use "Run File as Workflow on Databricks" for running notebooks'
                    );
                    return;
                }

                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                if (this.connection.syncDestinationMapper === undefined) {
                    promptForAttachingSyncDest();
                    return;
                }

                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks",
                        name: "Upload and Run File on Databricks",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );
            }
        };
    }

    /**
     * Run a Python file or notebook as a workflow on the connected cluster
     */
    runEditorContentsAsWorkflowCommand() {
        return async (resource: Uri) => {
            const targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                if (this.connection.syncDestinationMapper === undefined) {
                    promptForAttachingSyncDest();
                    return;
                }

                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks-workflow",
                        name: "Run File on Databricks as Workflow",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );
            }
        };
    }

    runConnectWithProgress() {
        const PROGRESS_FOLDER = path.join(os.homedir(), "query-progress")

        return async (resource: Uri) => {

            const queryProgress = new Map<string, number>()
            type ResolveType = (x: unknown) => void
            const resolves: ResolveType[] = []
            const watchers: fs.FSWatcher[] = []

            async function getConnectProgress(file: string): Promise<ConnectProgress> {
                const DEFAULT_PROGRESS: ConnectProgress = { completed: 0, total: 0 }

                const contents = await fs.readFile(file, { encoding: "utf-8" })
                return contents.trim() == "" ? DEFAULT_PROGRESS : JSON.parse(contents)
            }


            async function reportProgress(file: string) {
                if (queryProgress.has(file)) return
                queryProgress.set(file, 0)

                window.withProgress(
                    { location: ProgressLocation.Notification, title: `Query ${path.basename(file)}` },
                    async (p, _) => {
                        await new Promise(async ok => {
                            resolves.push(ok)
                            updateProgress(file, p, ok)

                            watchers.push(fs.watch(file, null, async (event, _) => {
                                if (event == "change") {
                                    updateProgress(file, p, ok)
                                } else if (event == "rename") { // file delete
                                    ok("done")
                                }
                            }))
                        })
                    }
                )

                async function updateProgress(file: string, p: Progress<{ message?: string, increment?: number }>, ok: any) {
                    const contents = await getConnectProgress(file)

                    const p100 = Math.round(100 * contents.completed / contents.total)
                    const prevP100 = queryProgress.get(file)!

                    const valUpdate = Math.max(p100 - prevP100, 0)

                    queryProgress.set(file, prevP100 + valUpdate)

                    p.report({
                        message: `Progress: ${contents.completed} / ${contents.total}`,
                        increment: valUpdate,
                    })
                    if (contents.completed >= contents.total && contents.total != 0) {
                        ok("done")
                    }
                }
            }

            const targetResource = this.getTargetResource(resource);
            if (targetResource) {

                watchers.push(fs.watch(PROGRESS_FOLDER, null, async (event, filename) => {
                    if (event == 'rename' && filename != null && (await fs.exists(path.join(PROGRESS_FOLDER, filename)))) {
                        reportProgress(path.join(PROGRESS_FOLDER, filename))
                    }
                }))

                await debug.startDebugging(
                    undefined,
                    {
                        type: "python",
                        name: "Run",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );

                debug.onDidTerminateDebugSession(() => {
                    watchers.forEach(w => w.close())
                    resolves.forEach(r => r("done"))
                })
            }
        };
    }

    private getTargetResource(resource: Uri): Uri | undefined {
        if (!resource && window.activeTextEditor) {
            return window.activeTextEditor.document.uri;
        }
        return resource;
    }
}
