import {TreeItem} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {Run, RunTask} from "@databricks/databricks-sdk/dist/apis/jobs";
import {GetUpdateResponse} from "@databricks/databricks-sdk/dist/apis/pipelines";

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
          jobResourceKey: string;
          /** The key used to refer to the resource in databricks.yml. */
          taskKey: string;
          parent?: TreeNode;
          data: Required<Job>["tasks"][number];
          status?: Run;
      }
    | {
          type: "treeItem";
          parent?: TreeNode;
          treeItem: BundleResourceExplorerTreeItem;
      }
    | {
          type: "job_run_status";
          parent?: TreeNode;
          resourceKey: string;
          jobId?: string;
          runId: number;
          status?: Run;
      }
    | {
          type: "task_run_status";
          parent?: TreeNode;
          jobResourceKey: string;
          jobId?: string;
          runId: number;
          taskKey: string;
          status?: RunTask;
      }
    | {
          type: "pipeline_run_status";
          parent?: TreeNode;
          pipelineId?: string;
          updateId: string;
          pipelineResourceKey: string;
          update?: GetUpdateResponse;
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
