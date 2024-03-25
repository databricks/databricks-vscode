import {EventEmitter, TreeDataProvider, TreeItem} from "vscode";
import {
    BundleVariable,
    BundleVariableModel,
} from "../../bundle/models/BundleVariableModel";
import {BundleVariableTreeNode} from "./types";
import {LookupVariableTreeNode} from "./LookupVariableTreeNode";
import {VariableTreeNode} from "./VariableTreeNode";

export class BundleVariableTreeDataProvider
    implements TreeDataProvider<BundleVariableTreeNode>
{
    constructor(private readonly bundleVariableModel: BundleVariableModel) {
        this.bundleVariableModel.onDidChangeKey("variables")(async () => {
            this.onDidChangeTreeDataEmitter.fire();
        });
    }
    private readonly onDidChangeTreeDataEmitter = new EventEmitter<
        | void
        | BundleVariableTreeNode
        | BundleVariableTreeNode[]
        | null
        | undefined
    >();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    getTreeItem(
        element: BundleVariableTreeNode
    ): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }

    async getChildren(element?: BundleVariableTreeNode | undefined) {
        if (element !== undefined) {
            return element.getChildren();
        }

        const variables: Record<string, BundleVariable> =
            (await this.bundleVariableModel.get("variables")) ?? {};

        const children: BundleVariableTreeNode[] = [];
        for (const key in variables) {
            const variable = variables[key];
            if (variable === undefined) {
                continue;
            }

            if (variable.lookup !== undefined) {
                children.push(
                    new LookupVariableTreeNode(key, variable, undefined)
                );
                continue;
            }

            children.push(new VariableTreeNode(key, variable, undefined));
        }

        return children;
    }
}
