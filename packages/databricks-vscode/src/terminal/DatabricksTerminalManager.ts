import {window, Terminal, Disposable} from "vscode";
import {WorkspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DatabricksEnvFileManager} from "../file-managers/DatabricksEnvFileManager";
import {format} from "util";
import {quote} from "shell-quote";

function getBashScript(opts: {databricksEnvFilePath: string}) {
    const script = `
    _original_PS1=$PS1

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
        if [[ -n "$DATABRICKS_BUNDLE_TARGET" ]]; then
            export PS1="($DATABRICKS_BUNDLE_TARGET) $_original_PS1"
        else
            PS1=$_original_PS1
        fi
    }
    _original_prompt_command=$PROMPT_COMMAND
    export PROMPT_COMMAND="load_databricks_env;$_original_prompt_command"
    clear
    `;

    return format(script, quote([opts.databricksEnvFilePath]));
}
export class DatabricksTerminalManager implements Disposable {
    private disposables: Disposable[] = [];
    private terminals: Terminal[] = [];
    private readonly terminalName = "Databricks Terminal";
    private activeTerminalIndex = -1;
    constructor(
        private workspaceConfigs: WorkspaceConfigs,
        private readonly databricksEnvFileManager: DatabricksEnvFileManager
    ) {
        window.terminals.forEach((t) => {
            if (t.name === this.terminalName) {
                t.dispose();
            }
        });
        this.disposables.push(
            window.onDidCloseTerminal((t) => {
                const idx = this.terminals.findIndex((it) => it === t);
                if (idx === -1) {
                    return;
                }
                this.activeTerminalIndex = -1;
                this.terminals.splice(idx, 1);
            }),
            window.onDidChangeActiveTerminal((t) => {
                this.activeTerminalIndex = this.terminals.findIndex(
                    (it) => it === t
                );
            })
        );
    }

    get activeTerminal() {
        if (this.activeTerminalIndex !== -1) {
            return Promise.resolve(this.terminals[this.activeTerminalIndex]);
        }

        return this.show();
    }

    get terminal() {
        return this.terminals.at(0);
    }

    async show(): Promise<Terminal> {
        if (this.terminal) {
            this.terminal.show();
            return this.terminal;
        }

        const terminal = await this.launch();
        terminal.show();
        return terminal;
    }

    async launch() {
        const terminal = window.createTerminal({
            name: this.terminalName,
            isTransient: true,
        });
        this.terminals.push(terminal);
        switch (this.workspaceConfigs.terminalDefaultProfile) {
            case "bash": {
                terminal.sendText(
                    getBashScript({
                        databricksEnvFilePath:
                            this.databricksEnvFileManager.databricksEnvPath
                                .fsPath,
                    })
                );
            }
        }

        return terminal;
    }

    dispose(): void {
        this.disposables.forEach((i) => i.dispose());
    }
}
