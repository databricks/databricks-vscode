import {TreeItem} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";

type Resources = Required<BundleRemoteState>["resources"];
type Job = Required<Resources>["jobs"][string];

export type TreeNode =
    | {
          [k in keyof Required<Resources>]: {
              type: k;
              /** The key used to refer to the job in databricks.yml. */
              resourceKey: string;
              parent?: TreeNode;
              data: Required<Resources>[k][string];
          };
      }[keyof Required<Resources>]
    | {
          type: "task";
          jobId?: string;
          /** The key used to refer to the job in databricks.yml. This is
           * especially useful for jobs which have not been deployed yet.
           */
          jobKey?: string;
          parent?: TreeNode;
          data: Required<Job>["tasks"][number];
      }
    | {
          type: "treeItem";
          parent?: TreeNode;
          treeItem: BundleResourceExplorerTreeItem;
      };

export interface BundleResourceExplorerTreeItem extends TreeItem {
    url?: string;
}

export interface Renderer {
    type: TreeNode["type"];
    getTreeItem(element: TreeNode): Promise<BundleResourceExplorerTreeItem>;
    getChildren(element: TreeNode): Promise<TreeNode[]>;
    getRoots(remoteStateConfig: BundleRemoteState): Promise<TreeNode[]>;
}
