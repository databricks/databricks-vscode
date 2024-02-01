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
};

export function getContextString(context: BundleTreeItemContext) {
    const parts = ["databricks", "bundle"];
    if (context.resourceType) {
        parts.push(`resource=${context.resourceType}`);

        if (
            (RUNNABLE_BUNDLE_RESOURCES as string[]).includes(
                context.resourceType
            ) &&
            !context.running
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

    parts.push(`nodeType=${context.nodeType}`);
    return parts.join(".");
}
