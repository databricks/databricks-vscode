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
        this.disposables.push(this.statusBarButton);
        this.disableStatusBarButton();
    }

    private async disableStatusBarButton() {
        const featureState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (featureState.isDisabledByFf || featureState.avaliable) {
            return;
        }
        this.statusBarButton.name = "Databricks Connect disabled";
        this.statusBarButton.text = "Databricks Connect disabled";
        this.statusBarButton.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
        );
        this.statusBarButton.tooltip = featureState?.reason;
        this.statusBarButton.command = {
            title: "Call",
            command: "databricks.call",
            arguments: [
                async () => {
                    const featureState = await this.featureManager.isEnabled(
                        "debugging.dbconnect",
                        true
                    );
                    if (!featureState.avaliable) {
                        if (featureState.action) {
                            featureState.action();
                        } else if (featureState.reason) {
                            window.showErrorMessage(featureState.reason);
                        }
                    }
                },
            ],
        };
        this.statusBarButton.show();
    }

    private async enableStatusBarButton() {
        const featureState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (!featureState.avaliable) {
            return;
        }
        this.statusBarButton.name = "Databricks Connect enabled";
        this.statusBarButton.text = "Databricks Connect enabled";
        this.statusBarButton.tooltip = "Databricks Connect enabled";
        this.statusBarButton.backgroundColor = undefined;
        this.statusBarButton.command = {
            title: "Call",
            command: "databricks.call",
            arguments: [
                () => {
                    this.featureManager.isEnabled("debugging.dbconnect", true);
                },
            ],
        };
        this.statusBarButton.show();
    }

    public async update() {
        const featureState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (!featureState.avaliable) {
            this.disableStatusBarButton();
        } else {
            this.enableStatusBarButton();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
