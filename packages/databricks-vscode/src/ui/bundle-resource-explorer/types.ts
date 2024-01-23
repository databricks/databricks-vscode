import {TreeItem} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";

type Resources = Required<BundleRemoteState>["resources"];
type Job = Required<Resources>["jobs"][string];

export type ResourceTreeNode = {
    [k in keyof Required<Resources>]: {
        type: k;
        /** The key used to refer to the resource in databricks.yml. Also the key used for running the resource*/
        resourceKey: string;
        parent?: TreeNode;
        data: Required<Resources>[k][string];
    };
}[keyof Required<Resources>];

export type TreeNode =
    | ResourceTreeNode
    | {
          type: "task";
          jobId?: string;
          /** The key used to refer to the job in databricks.yml. This is
           * especially useful for jobs which have not been deployed yet.
           */
          jobKey: string;
          /** The key used to refer to the resource in databricks.yml. */
          resourceKey: string;
          parent?: TreeNode;
          data: Required<Job>["tasks"][number];
      }
    | {
          type: "treeItem";
          parent?: TreeNode;
          treeItem: BundleResourceExplorerTreeItem;
      }
    | {
          [k in keyof Required<Resources>]: {
              type: "resource_type_header";
              parent: undefined;
              resourceType: k;
              children: TreeNode[];
          };
      }[keyof Required<Resources>];

export interface BundleResourceExplorerTreeItem extends TreeItem {
    url?: string;
}

export interface Renderer {
    type: TreeNode["type"];
    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem;
    getChildren(element: TreeNode): TreeNode[];
    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[];
}
