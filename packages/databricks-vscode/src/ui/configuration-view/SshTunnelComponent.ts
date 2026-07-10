import {ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ConnectionManager} from "../../configuration/ConnectionManager";

export class SshTunnelComponent extends BaseComponent {
    constructor(private readonly connectionManager: ConnectionManager) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        if (this.connectionManager.state !== "CONNECTED") {
            return [];
        }

        return [
            {
                label: "Start SSH Tunnel",
                iconPath: new ThemeIcon("remote"),
                contextValue: "databricks.configuration.sshTunnel",
                collapsibleState: TreeItemCollapsibleState.None,
                tooltip: "Start Databricks remote development via SSH",
                command: {
                    title: "Start SSH Tunnel",
                    command: "databricks.ssh.startTunnel",
                },
            },
        ];
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        return [];
    }
}
