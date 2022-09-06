import {spawn} from "child_process";
import {ExtensionContext, TaskExecution} from "vscode";
import {CliWrapper} from "./CliWrapper";

export class CliCommands {
    currentTaskExecution?: TaskExecution;

    constructor(private cli: CliWrapper) {}

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
}
