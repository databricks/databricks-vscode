/* eslint-disable no-prototype-builtins */
import {
    Disposable,
    EventEmitter,
    ProviderResult,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {BundleTarget} from "./bundle_schema";
import {has} from "lodash";
import {BundleModel} from "./BundleModel";

export interface BundleTargetWithName {
    name: string;
    target: BundleTarget;
}

function isBundleTargetWithName(
    target: BundleTargetWithName | TreeItem
): target is BundleTargetWithName {
    return has(target, "target") && has(target, "name");
}

export class BundleTargetDataProvider
    implements TreeDataProvider<BundleTargetWithName | TreeItem>
{
    private disposables: Disposable[] = [];
    private _onDidChangeTreeData = new EventEmitter<
        void | BundleTargetWithName | BundleTargetWithName[] | null | undefined
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly bundleModel: BundleModel) {
        this.disposables.push(
            this.bundleModel.onDidChangeSelectedTarget(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.bundleModel.onDidChangeBundleData(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    update() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(
        element: BundleTargetWithName | TreeItem
    ): TreeItem | Thenable<TreeItem> {
        if (isBundleTargetWithName(element)) {
            return {
                label: element.name,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                ...(this.bundleModel.selectedTarget === element.name
                    ? {
                          iconPath: new ThemeIcon(
                              "pass",
                              new ThemeColor("testing.iconPassed")
                          ),
                          contextValue: "databricks.bundle.target.selected",
                      }
                    : {}),
            };
        }
        return element;
    }

    getChildren(
        element?: BundleTargetWithName | TreeItem | undefined
    ): ProviderResult<(BundleTargetWithName | TreeItem)[]> {
        if (element === undefined) {
            return this.collectTargets();
        }

        if (element instanceof TreeItem) {
            return [];
        }

        return [
            {
                label: "Host",
                description: element.target.workspace?.host,
                collapsibleState: TreeItemCollapsibleState.None,
            },
            element.target.mode
                ? {
                      label: "Mode",
                      description: element.target.mode,
                      collapsibleState: TreeItemCollapsibleState.None,
                  }
                : undefined,
        ].filter((i) => i !== undefined) as (BundleTargetWithName | TreeItem)[];
    }

    async collectTargets() {
        const flattenedTargets: BundleTargetWithName[] = [];
        (await this.bundleModel.collectTargets()).forEach((target, name) => {
            flattenedTargets.push({name, target});
        });
        return flattenedTargets;
    }
    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
