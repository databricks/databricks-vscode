import type { BundleResourceModifiedStatus } from "../../kernel/cli/commands/bundle";

/** Resource types that `bundle run` can run; their rows get the run actions. */
const RUNNABLE_BUNDLE_RESOURCES = ["jobs", "pipelines"];

export interface BundleTreeItemContext {
    readonly resourceType?: string;
    readonly nodeType: string;
    readonly running?: boolean;
    readonly cancellable?: boolean;
    readonly hasUrl?: boolean;
    readonly hasSourceLocation?: boolean;
    readonly hasPipelineDetails?: boolean;
    readonly modifiedStatus?: BundleResourceModifiedStatus;
}

/**
 * A row's `contextValue`, which the menus match with `viewItem =~ …`:
 * `databricks.bundle.resource=jobs.runnable.has-url.nodeType=jobs`. Ported
 * from the old `ContextUtils.ts`; the format is unchanged.
 */
export function getContextString(context: BundleTreeItemContext): string {
    const parts = ["databricks", "bundle"];
    if (context.resourceType) {
        parts.push(`resource=${context.resourceType}`);
        if (
            RUNNABLE_BUNDLE_RESOURCES.includes(context.resourceType) &&
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
    if (context.hasSourceLocation) {
        parts.push("has-source-location");
    }
    if (context.hasPipelineDetails) {
        parts.push("has-pipeline-details");
    }
    parts.push(`nodeType=${context.nodeType}`);
    return parts.join(".");
}
