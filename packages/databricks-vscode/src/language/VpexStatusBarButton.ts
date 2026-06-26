import {Disposable, StatusBarAlignment, StatusBarItem, window} from "vscode";
import {VpexEnvironmentSetup} from "./VpexEnvironmentSetup";

// Persistent status bar button that triggers the VPEX environment setup flow.
// After a successful setup it reflects the matched state.
export class VpexStatusBarButton implements Disposable {
    private disposables: Disposable[] = [];
    private statusBarButton: StatusBarItem;

    constructor(private readonly setup: VpexEnvironmentSetup) {
        this.statusBarButton = window.createStatusBarItem(
            StatusBarAlignment.Left,
            999
        );
        this.statusBarButton.command = "databricks.environment.setupVpex";
        this.disposables.push(this.statusBarButton);
        this.setIdle();
        this.statusBarButton.show();
    }

    private setIdle() {
        this.statusBarButton.name = "Databricks Env (VPEX)";
        this.statusBarButton.text = "$(rocket) Databricks Env";
        this.statusBarButton.tooltip =
            "Set up the Databricks Connect Python environment";
    }

    private setReady() {
        this.statusBarButton.name = "Databricks Env (VPEX)";
        this.statusBarButton.text =
            "$(check) Databricks Env: serverless-v4 · py3.12";
        this.statusBarButton.tooltip =
            "Environment ready: serverless-v4 (Python 3.12, databricks-connect 17.3). Click to re-run setup.";
    }

    // Refresh the button label from the setup flow's current state.
    public update() {
        if (this.setup.ready) {
            this.setReady();
        } else {
            this.setIdle();
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
