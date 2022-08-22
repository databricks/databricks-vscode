import {spawn} from "child_process";
import {
    ExtensionContext,
    ProcessExecution,
    Task,
    TaskExecution,
    TaskRevealKind,
    tasks,
    TaskScope,
    window,
    workspace,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CliWrapper} from "./CliWrapper";

export class CliCommands {
    currentTaskExecution?: TaskExecution;

    constructor(
        private connection: ConnectionManager,
        private cli: CliWrapper
    ) {}

    testBricksCommand(context: ExtensionContext) {
        return () => {
            const {command, args} = this.cli.getTestBricksCommand(context);
            const cmd = spawn(command, args);

            cmd.stdout.on("data", (data) => {
                console.log((data as Buffer).toString());
            });

            cmd.on("exit", (code) => {
                if (code === 0) {
                    console.log("Bricks cli found");
                } else {
                    console.error("Bricks cli NOT found");
                }
            });

            cmd.on("error", () => {
                console.error("Bricks cli NOT found");
            });
        };
    }

    stopSyncCommand() {
        return () => {
            if (this.currentTaskExecution) {
                this.currentTaskExecution.terminate();
            }
        };
    }

    startSyncCommand(syncType: "full" | "incremental") {
        return async () => {
            const workspacePath = workspace.rootPath;
            const me = this.connection.me;
            const syncDestination = this.connection.syncDestination;
            const profile = this.connection.profile;

            if (!workspacePath) {
                window.showErrorMessage(
                    "Can't start sync: No workspace opened!"
                );
                return;
            }

            if (!me || !profile) {
                window.showErrorMessage(
                    "Can't start sync: Databricks connection not configured!"
                );
                return;
            }
            if (!syncDestination) {
                window.showErrorMessage(
                    "Can't start sync: Databricks synchronization destination not configured!"
                );
                return;
            }

            if (this.currentTaskExecution) {
                this.currentTaskExecution.terminate();
            }

            const {command, args} = this.cli.getSyncCommand(
                profile,
                me,
                syncDestination,
                syncType
            );

            const task = new Task(
                {
                    type: "bricks",
                },
                TaskScope.Workspace,
                "$(rocket) Databricks Sync",
                "bricks",
                new ProcessExecution(command, args, {
                    cwd: workspacePath,
                })
            );
            task.isBackground = true;
            task.problemMatchers = ["$bricks-sync"];
            task.presentationOptions.echo = true;
            task.presentationOptions.reveal = TaskRevealKind.Always;

            this.currentTaskExecution = await tasks.executeTask(task);
        };
    }
}
