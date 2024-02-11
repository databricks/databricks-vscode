import {window, Terminal} from "vscode";
import {WorkspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DatabricksEnvFileManager} from "../file-managers/DatabricksEnvFileManager";
import {format} from "util";
import {quote} from "shell-quote";

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
`;

export class DatabricksTerminal {
    private terminal: Terminal | undefined;
    private readonly script: string = format(
        script,
        quote([this.databricksEnvFileManager.databricksEnvPath.fsPath])
    );

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

    async launch() {
        this.terminal = window.createTerminal({name: "Databricks"});
        this.terminal.sendText(this.script);
        this.terminal.sendText("clear");
    }
}
