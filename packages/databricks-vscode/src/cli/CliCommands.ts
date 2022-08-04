import {
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
            const pathMapper = this.connection.pathMapper;
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
            if (!me || !pathMapper || !profile) {
                window.showErrorMessage(
                    "Can't start sync: Databricks synchronization destination not configured!"
                );
                return;
            }

            if (this.currentTaskExecution) {
                this.currentTaskExecution.terminate();
            }

            const args = [
                "sync",
                "repo",
                "--profile",
                profile,
                "--user",
                me,
                "--dest-repo",
                pathMapper.remoteWorkspaceName,
            ];

            if (syncType === "full") {
                args.push("--full-sync");
            }

            const definition = {
                type: "bricks",
                command: this.cli.bricksExecutable,
                args: args,
            };

            const task = new Task(
                definition,
                TaskScope.Workspace,
                "$(rocket) Databricks Sync",
                "bricks",
                new ProcessExecution(
                    this.cli.bricksExecutable,
                    definition.args,
                    {
                        cwd: workspacePath,
                    }
                )
            );
            task.isBackground = true;
            task.problemMatchers = ["$bricks-sync"];
            task.presentationOptions.echo = true;
            task.presentationOptions.reveal = TaskRevealKind.Always;

            this.currentTaskExecution = await tasks.executeTask(task);
        };
    }
}
