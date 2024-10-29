import {
    TreeView,
    TreeCheckboxChangeEvent,
    Disposable,
    TreeItemCheckboxState,
} from "vscode";
import {ConfigurationTreeItem} from "./types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {CLUSTER_OVERRIDE_CHECKBOX_ID} from "./ClusterComponent";

export class ConfigurationTreeViewManager implements Disposable {
    private readonly disposables: Disposable[] = [];
    constructor(
        readonly treeView: TreeView<ConfigurationTreeItem>,
        readonly configModel: ConfigModel
    ) {
        this.disposables.push(
            treeView.onDidChangeCheckboxState(
                async (e: TreeCheckboxChangeEvent<ConfigurationTreeItem>) => {
                    await Promise.all(
                        e.items.map(async ([item, state]) => {
                            if (item.id === CLUSTER_OVERRIDE_CHECKBOX_ID) {
                                await this.configModel.set(
                                    "useClusterOverride",
                                    state === TreeItemCheckboxState.Checked
                                );
                            }
                        })
                    );
                }
            )
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
