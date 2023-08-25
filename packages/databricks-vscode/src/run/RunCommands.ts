import {debug, ProgressLocation, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {promptForAttachingSyncDest} from "./prompts";
import {FileUtils} from "../utils";
import {LocalUri} from "../sync/SyncDestination";

import *  as fs from 'fs-extra'
import * as path from 'path'

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
        const PROGRESS_FOLDER = "/Users/niranjan.jayakar/Desktop/watch-folder"

        return async (resource: Uri) => {

            const trackFiles = new Set<string>()

            async function getConnectProgress(file: string): Promise<ConnectProgress> {
                const DEFAULT_PROGRESS: ConnectProgress = { completed: 0, total: 0 }

                const contents = await fs.readFile(file, { encoding: "utf-8" })
                return contents.trim() == "" ? DEFAULT_PROGRESS : JSON.parse(contents)
            }


            async function reportProgress(file: string) {
                if (trackFiles.has(file)) return
                trackFiles.add(file)

                window.withProgress(
                    { location: ProgressLocation.Notification, title: `Query ${path.basename(file)} Progress` },
                    async (p, _) => {
                        await new Promise(async ok => {
                            const contents = await getConnectProgress(file)
                            p.report({ message: JSON.stringify(contents) })
                            if (contents.completed == contents.total) {
                                ok("done")
                            }

                            fs.watch(file, null, async (event, _) => {
                                if (event == "change") {
                                    const contents = await getConnectProgress(file)
                                    p.report({ message: JSON.stringify(contents) })
                                    if (contents.completed == contents.total) {
                                        ok("done")
                                    }
                                } else if (event == "rename") { // file delete
                                    ok("done")
                                }
                            })
                        })
                    }
                )
            }

            const targetResource = this.getTargetResource(resource);
            if (targetResource) {

                fs.watch(PROGRESS_FOLDER, null, async (event, filename) => {
                    if (event == 'rename' && filename != null && (await fs.exists(path.join(PROGRESS_FOLDER, filename)))) {
                        reportProgress(path.join(PROGRESS_FOLDER, filename))
                    }
                })
            }

            // FIXME: Run forever
            await new Promise(r => {})
        };
    }

    private getTargetResource(resource: Uri): Uri | undefined {
        if (!resource && window.activeTextEditor) {
            return window.activeTextEditor.document.uri;
        }
        return resource;
    }
}
