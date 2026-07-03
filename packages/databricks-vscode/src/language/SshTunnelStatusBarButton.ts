import {
    Disposable,
    StatusBarAlignment,
    StatusBarItem,
    window,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

export class SshTunnelStatusBarButton implements Disposable {
    private disposables: Disposable[] = [];
    statusBarButton: StatusBarItem;

    constructor(private readonly connectionManager: ConnectionManager) {
        // Priority 1001 places this just to the left of the "Databricks
        // Connect" button (priority 1000) in the left status bar group
        // (higher priority sits further left).
        this.statusBarButton = window.createStatusBarItem(
            StatusBarAlignment.Left,
            1001
        );
        this.statusBarButton.name = "Start SSH Tunnel";
        this.statusBarButton.text = "$(remote) Start SSH Tunnel";
        this.statusBarButton.tooltip =
            "Start Databricks remote development via SSH";
        this.statusBarButton.command = {
            title: "Start SSH Tunnel",
            command: "databricks.ssh.startTunnel",
        };
        this.disposables.push(
            this.statusBarButton,
            this.connectionManager.onDidChangeState(this.update, this)
        );
        this.update();
    }

    private update() {
        if (this.connectionManager.state === "CONNECTED") {
            this.statusBarButton.show();
        } else {
            this.statusBarButton.hide();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
