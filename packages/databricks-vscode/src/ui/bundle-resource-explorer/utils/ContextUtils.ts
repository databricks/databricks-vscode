import {BundleResourceModifiedStatus} from "../../../bundle/models/BundleRemoteStateModel";
import {RUNNABLE_BUNDLE_RESOURCES} from "../BundleCommands";
import {
    BundleResourceExplorerResourceKey,
    BundleResourceExplorerTreeNode,
} from "../types";

type BundleTreeItemContext = {
    resourceType?: BundleResourceExplorerResourceKey;
    nodeType: BundleResourceExplorerTreeNode["type"];
    running?: boolean;
    cancellable?: boolean;
    hasUrl?: boolean;
    hasPipelineDetails?: boolean;
    modifiedStatus?: BundleResourceModifiedStatus;
};

export function getContextString(context: BundleTreeItemContext) {
    const parts = ["databricks", "bundle"];
    if (context.resourceType) {
        parts.push(`resource=${context.resourceType}`);

        if (
            (RUNNABLE_BUNDLE_RESOURCES as string[]).includes(
                context.resourceType
            ) &&
            !context.running &&
            context.modifiedStatus !== "deleted"
        ) {
            parts.push("runnable");
        }
    }

    if (context.running) {
        parts.push("running");
    }

    if (context.cancellable) {
        parts.push("cancellable");
    }

    if (context.hasUrl) {
        parts.push("has-url");
    }

    if (context.hasPipelineDetails) {
        parts.push("has-pipeline-details");
    }

    parts.push(`nodeType=${context.nodeType}`);
    return parts.join(".");
}
