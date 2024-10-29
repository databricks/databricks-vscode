import {
    Disposable,
    StatusBarAlignment,
    StatusBarItem,
    ThemeColor,
    window,
} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";

export class DbConnectStatusBarButton implements Disposable {
    private disposables: Disposable[] = [];
    statusBarButton: StatusBarItem;

    constructor(private readonly featureManager: FeatureManager) {
        this.statusBarButton = window.createStatusBarItem(
            StatusBarAlignment.Left,
            1000
        );
        this.disposables.push(
            this.statusBarButton,
            this.featureManager.onDidChangeState(
                "environment.dependencies",
                this.update,
                this
            )
        );
        this.disableStatusBarButton();
    }

    private async disableStatusBarButton() {
        const featureState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        if (featureState.available) {
            return;
        }
        this.statusBarButton.name = "Databricks Connect disabled";
        this.statusBarButton.text = "Databricks Connect disabled";
        this.statusBarButton.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
        );
        // this.statusBarButton.tooltip = featureState?.message;
        this.statusBarButton.command = {
            title: "Setup Databricks Connect",
            command: "databricks.environment.setup",
        };
        this.statusBarButton.show();
    }

    private async enableStatusBarButton() {
        const featureState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        if (!featureState.available) {
            return;
        }
        this.statusBarButton.name = "Databricks Connect enabled";
        this.statusBarButton.text = "Databricks Connect enabled";
        this.statusBarButton.tooltip = "Databricks Connect enabled";
        this.statusBarButton.backgroundColor = undefined;
        this.statusBarButton.command = {
            title: "Setup Databricks Connect",
            command: "databricks.environment.setup",
        };
        this.statusBarButton.show();
    }

    public async update() {
        const featureState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        if (!featureState.available) {
            this.disableStatusBarButton();
        } else {
            this.enableStatusBarButton();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
