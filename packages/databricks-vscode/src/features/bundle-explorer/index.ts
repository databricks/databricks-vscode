import { TreeItemCollapsibleState, window } from "vscode";
import type { Feature } from "../../kernel/feature";
import { PROJECT_VIEW } from "../../kernel/project/commands";
import { Emitter } from "../../platform/event";
import { SECTION_ORDER } from "../../platform/ui/sections";
import { NodeGroupSection, nodeArgument } from "../../platform/ui/nodeGroup";
import { REFRESH_REMOTE_STATE, refreshRemoteState, SHOW_LOGS } from "./BundleExplorerCommands";
import { BundleExplorerTreeDataProvider } from "./BundleExplorerTreeDataProvider";
import type { ExplorerNode } from "./explorerNode";
import {
    deployAndReport,
    DEPLOY,
    destroy,
    DESTROY,
    FORCE_DEPLOY,
    FORCE_DESTROY,
} from "./BundleCommands";
import { TreeItemDecorationProvider } from "./decorations";
import { PipelineDatasets } from "./run/pipelineDatasets";
import { PipelineDiagnostics } from "./run/PipelineDiagnostics";
import {
    CANCEL_RUN,
    CLEAR_PIPELINE_DIAGNOSTICS,
    DEPLOY_AND_RUN_FROM_INPUT,
    DEPLOY_AND_RUN_JOB,
    DEPLOY_AND_RUN_PIPELINE,
    DEPLOY_AND_RUN_SELECTED_TABLES,
    DEPLOY_AND_VALIDATE_PIPELINE,
    RunCommands,
    SHOW_PIPELINE_EVENT_DETAILS,
} from "./run/RunCommands";
import { RunTerminals } from "./run/RunTerminal";
import { RunTrackers } from "./run/RunTrackers";
import { BUNDLE_EXPLORER_EVENTS } from "./telemetry";

/**
 * The bundle's resources (BNDL-02) as the Resources group of the Project
 * view: by type, jobs with their tasks, refresh, deploy and destroy
 * (BNDL-05, BNDL-06), the bundle log, and deploy-and-run with run trackers,
 * pipeline datasets and diagnostics (BNDL-08 to BNDL-12). Project scope; the
 * group shows once a target is set. The runs belong to the project session.
 */
export const bundleExplorer: Feature = {
    id: "bundle-explorer",
    telemetryEvents: BUNDLE_EXPLORER_EVENTS,
    // The commands need a target, as locally; the view shows once one is set.
    session: {
        [REFRESH_REMOTE_STATE]: "same",
        [SHOW_LOGS]: "same",
        [DEPLOY]: "same",
        [FORCE_DEPLOY]: "same",
        [DESTROY]: "same",
        [FORCE_DESTROY]: "same",
        [DEPLOY_AND_RUN_JOB]: "same",
        [DEPLOY_AND_RUN_PIPELINE]: "same",
        [DEPLOY_AND_VALIDATE_PIPELINE]: "same",
        [DEPLOY_AND_RUN_SELECTED_TABLES]: "same",
        [DEPLOY_AND_RUN_FROM_INPUT]: "same",
        [CANCEL_RUN]: "same",
        [CLEAR_PIPELINE_DIAGNOSTICS]: "same",
        [SHOW_PIPELINE_EVENT_DETAILS]: "same",
    },

    register(ctx) {
        const { bundle, bundleLog, extension, connection } = ctx.kernel;
        const trackers = new RunTrackers();
        const runChanged = new Emitter<string>();
        const datasets = new PipelineDatasets(
            (key) => trackers.pipelineHistory(key),
            () => connection.connection?.api,
        );
        const diagnostics = new PipelineDiagnostics();
        const terminals = new RunTerminals(window);
        const runs = new RunCommands({
            kernel: ctx.kernel,
            telemetry: ctx.telemetry,
            log: ctx.log,
            trackers,
            datasets,
            diagnostics,
            terminals,
            showError: (e) => ctx.commands.showError(e),
        });
        const provider = new BundleExplorerTreeDataProvider(
            bundle.deployed,
            (p) => extension.asAbsolutePath(p),
            ctx.log,
            {
                runs: trackers,
                datasets,
            },
        );
        // The Resources group reads the provider's rows; the provider only ever refreshes.
        ctx.whileProjectSession((session) => {
            if (session.target === undefined) {
                return;
            }
            const added = ctx.sections.add(
                new NodeGroupSection({
                    id: "bundleResources",
                    order: SECTION_ORDER.resources,
                    label: "Resources",
                    groupId: "resources",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    nodes: () => provider.getChildren(),
                    onDidChange: (listener) => provider.onDidChangeTreeData(() => listener()),
                    // A poll redraws its resource's row alone: a full refresh drops every row for a
                    // moment, and a click on Cancel run in that moment gets no row.
                    onDidChangeNode: runChanged.event,
                    rowKey: (node) => {
                        const { type, resourceKey } = node as Partial<
                            ExplorerNode & { resourceKey: string }
                        >;
                        return type === "jobs" || type === "pipelines" ? resourceKey : undefined;
                    },
                    log: ctx.log,
                }),
            );
            return added;
        });
        const decorations = new TreeItemDecorationProvider();
        ctx.subscriptions.push(
            provider,
            window.registerFileDecorationProvider(decorations),
            decorations,
            provider.onDidChangeTreeData(() => decorations.refresh()),
            trackers,
            runChanged,
            diagnostics,
            terminals,
            trackers.onDidChange((resourceKey) => {
                if (resourceKey === undefined) {
                    provider.refresh();
                } else {
                    runChanged.fire(resourceKey);
                }
                runs.updateDiagnostics().catch((e: unknown) =>
                    ctx.log.warn("Failed to update pipeline diagnostics", e),
                );
            }),
        );
        // A new project or target starts with no runs; the old ones stop being followed.
        ctx.whileProjectSession(() => ({
            dispose: () => {
                trackers.clear();
                datasets.clear();
                diagnostics.clear();
            },
        }));
        // Background refreshes show as progress on the view, as explicit ones do.
        ctx.subscriptions.push(
            bundle.validated.onDidChange((s) => {
                if (s.status === "loading") {
                    void window.withProgress({ location: { viewId: PROJECT_VIEW } }, async () => {
                        await bundle.validated.settled();
                        await bundle.deployed.settled();
                    });
                }
            }),
        );
        ctx.commands.register(
            REFRESH_REMOTE_STATE,
            () => refreshRemoteState(ctx.kernel, datasets),
            {
                scope: "project",
            },
        );
        ctx.commands.register(SHOW_LOGS, () => bundleLog.show());
        ctx.commands.register(DEPLOY, () => deployAndReport(ctx.kernel, ctx.log), {
            scope: "project",
        });
        ctx.commands.register(FORCE_DEPLOY, () => deployAndReport(ctx.kernel, ctx.log, true), {
            scope: "project",
        });
        // `destroy(force, warn)` keeps the old signature; the e2e spec passes both.
        ctx.commands.register(
            DESTROY,
            (_project, force?: unknown, warn?: unknown) =>
                destroy(ctx.kernel, ctx.log, force === true, warn !== false),
            {
                scope: "project",
            },
        );
        ctx.commands.register(FORCE_DESTROY, () => destroy(ctx.kernel, ctx.log, true), {
            scope: "project",
        });

        ctx.commands.register(
            DEPLOY_AND_RUN_JOB,
            (_project, node?: unknown) => runs.deployAndRun(nodeArgument(node)),
            { scope: "project" },
        );
        ctx.commands.register(
            DEPLOY_AND_RUN_PIPELINE,
            (_project, node?: unknown) => runs.deployAndRun(nodeArgument(node)),
            { scope: "project" },
        );
        ctx.commands.register(
            DEPLOY_AND_VALIDATE_PIPELINE,
            (_project, node?: unknown) => runs.deployAndValidate(nodeArgument(node)),
            { scope: "project" },
        );
        ctx.commands.register(
            DEPLOY_AND_RUN_SELECTED_TABLES,
            (_project, node?: unknown) => runs.deployAndRunSelectedTables(nodeArgument(node)),
            {
                scope: "project",
            },
        );
        ctx.commands.register(
            DEPLOY_AND_RUN_FROM_INPUT,
            (_project, options?: { resourceType?: string; resourceKey?: string; args?: string }) =>
                runs.deployAndRunFromInput(options),
            { scope: "project" },
        );
        ctx.commands.register(
            CANCEL_RUN,
            (_project, node?: unknown) => runs.cancelRun(nodeArgument(node)),
            { scope: "project" },
        );
        ctx.commands.register(CLEAR_PIPELINE_DIAGNOSTICS, () => runs.clearPipelineDiagnostics(), {
            scope: "project",
        });
        ctx.commands.register(
            SHOW_PIPELINE_EVENT_DETAILS,
            (_project, item?: unknown) => runs.showPipelineEventDetails(nodeArgument(item)),
            {
                scope: "project",
            },
        );
    },
};
