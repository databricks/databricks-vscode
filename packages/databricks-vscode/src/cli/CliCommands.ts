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
            if (!pathMapper) {
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
                pathMapper,
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
