import {window, Terminal} from "vscode";
import {WorkspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DatabricksEnvFileManager} from "../file-managers/DatabricksEnvFileManager";
import {format} from "util";
import {quote} from "shell-quote";

function getBashScript(opts: {databricksEnvFilePath: string}) {
    const script = `
    load_databricks_env() {
        ENV_FILE=%s
        if [ -f "$ENV_FILE" ]; then
            while read -r line
            do
                # Only export non-empty lines and skip lines starting with #
                if [[ ! -z "$line" && ! "$line" =~ ^# ]]; then
                    export $line
                fi
            done < "$ENV_FILE"
        fi
    }
    _original_prompt_command=$PROMPT_COMMAND
    export PROMPT_COMMAND="load_databricks_env;$_original_prompt_command"
    clear
    `;

    return format(script, quote([opts.databricksEnvFilePath]));
}
export class DatabricksTerminal {
    private terminal: Terminal | undefined;

    constructor(
        private workspaceConfigs: WorkspaceConfigs,
        private readonly databricksEnvFileManager: DatabricksEnvFileManager
    ) {
        window.onDidCloseTerminal((t) => {
            if (t === this.terminal) {
                this.terminal = undefined;
            }
        });
    }
    async show() {
        if (this.terminal) {
            this.terminal.show();
            return;
        }

        await this.launch();
    }

    private async launch() {
        switch (this.workspaceConfigs.terminalDefaultProfile) {
            case "bash":
                this.terminal = window.createTerminal({name: "Databricks"});
                this.terminal.sendText(
                    getBashScript({
                        databricksEnvFilePath:
                            this.databricksEnvFileManager.databricksEnvPath
                                .fsPath,
                    })
                );
                break;
            default:
                this.terminal;
        }
    }
}
