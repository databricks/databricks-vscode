import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    commands,
    debug,
    DebugAdapterInlineImplementation,
    ProgressLocation,
    window,
    type Disposable,
} from "vscode";
import { syncDestination } from "../../kernel/bundle/SyncDestination";
import { ATTACH_CLUSTER_QUICK_PICK, START_CLUSTER } from "../../kernel/compute/commands";
import type { Feature, FeatureContext } from "../../kernel/feature";
import { SELECT_TARGET } from "../../kernel/project/commands";
import { contextKey } from "../../platform/contextKeys";
import { disposeAll } from "../../platform/event";
import { UserFacingError } from "../../platform/errors";
import { when } from "../../platform/reactive";
import { setting } from "../../platform/settings";
import { abortable } from "../../platform/timers";
import { DatabricksDebugSession } from "./DatabricksDebugSession";
import {
    canRunAsWorkflow,
    isInProject,
    RUN_EDITOR_CONTENTS,
    RUN_EDITOR_CONTENTS_AS_WORKFLOW,
    runEditorContents,
    runEditorContentsAsWorkflow,
    SESSION_RUN_UNAVAILABLE,
    targetResource,
} from "./RunCommands";
import type { RunContext, RunPrompts } from "./RunContext";
import { RUN_EVENTS, WORKFLOW_RUN } from "./telemetry";
import { WorkflowDebugSession } from "./WorkflowDebugSession";
import { WorkflowOutputPanel } from "./WorkflowOutputPanel";
import { WorkflowRunner } from "./WorkflowRunner";

/** The active file is a local Python file or notebook: "Run File as Workflow" applies (old name). */
export const SHOW_RUN_AS_WORKFLOW = contextKey<boolean>("databricks.context.showRunAsWorkflow");

/** The active file is in the active project: the editor title shows "Run on Databricks" (old name). */
export const IS_ACTIVE_FILE_IN_ACTIVE_WORKSPACE = contextKey<boolean>(
    "databricks.context.isActiveFileInActiveWorkspace",
);

/** `databricks.wsfs.rearrangeCells` (old name): move `%pip install` cells first in the workflow wrappers. */
const REARRANGE_CELLS = setting<boolean>("databricks", "wsfs.rearrangeCells", true);

/** The prompts of the old `run/prompts.ts`, with their strings. */
function prompts(ctx: FeatureContext): RunPrompts {
    const prompt = (message: string, action: string, run: () => Thenable<unknown>) => {
        void ctx.commands.showError(
            new UserFacingError("RUN_PRECONDITION", message, {
                actions: [
                    { title: action, run },
                    { title: "Cancel", run: () => {} },
                ],
            }),
        );
    };
    return {
        changeTargetMode: (mode) =>
            prompt(
                `Running is disabled for non development targets. Current target mode is ${mode}.`,
                "Change Target Mode",
                () => commands.executeCommand(SELECT_TARGET),
            ),
        attachCluster: () =>
            prompt("Please attach a cluster", "Attach Cluster", () =>
                commands.executeCommand(ATTACH_CLUSTER_QUICK_PICK.id),
            ),
        startCluster: () =>
            prompt("The attached cluster is not running.", "Start Cluster", () =>
                commands.executeCommand(START_CLUSTER.id),
            ),
    };
}

/** What the runners need, from the kernel and the window. */
function runContext(ctx: FeatureContext): RunContext {
    const { kernel } = ctx;
    return {
        log: ctx.log,
        connection: async (signal, onWait) => {
            let state = kernel.connection.state.value;
            if (state.status === "connecting") {
                onWait?.();
                state = await when(
                    kernel.connection.state,
                    (s) => s.status !== "connecting",
                    signal,
                );
            }
            if (state.status !== "connected") {
                throw new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first.");
            }
            return state.connection;
        },
        target: async (signal) => {
            const root = kernel.project.active.value?.root;
            const target = kernel.project.target.value;
            if (root === undefined || target === undefined) {
                throw new UserFacingError("NO_TARGET", "Select a bundle target first.");
            }
            // The mode and the destination come from validate: wait for one in flight, as the old `configModel.get` did.
            await abortable(kernel.bundle.validated.settled(), signal);
            const validated = kernel.bundle.validated.latest;
            const current =
                validated?.root === root && validated.target === target ? validated : undefined;
            return {
                mode:
                    current?.config.bundle?.mode ??
                    kernel.project.active.value?.config.targets.find((t) => t.name === target)
                        ?.mode,
                destination: syncDestination(current),
            };
        },
        progress: async (signal, task) =>
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Uploading bundle assets",
                    cancellable: true,
                },
                async (progress, token) => {
                    const cancelled = new AbortController();
                    const subscription = token.onCancellationRequested(() => cancelled.abort());
                    try {
                        return await task(AbortSignal.any([signal, cancelled.signal]), (message) =>
                            progress.report({ message }),
                        );
                    } finally {
                        subscription.dispose();
                    }
                },
            ),
        upload: async (signal) => {
            kernel.bundleLog.show();
            await kernel.bundle.operations.syncOnce({ signal });
        },
        focusDebugConsole: async () => {
            await commands.executeCommand("workbench.panel.repl.view.focus");
        },
        compute: () => kernel.compute.effective.value,
        getCluster: (clusterId, signal) => kernel.compute.getCluster(clusterId, signal),
        prompts: prompts(ctx),
        readResource: (name) =>
            readFile(
                kernel.extension.asAbsolutePath(path.join("resources", "python", name)),
                "utf-8",
            ),
        rearrangeCells: () => kernel.settings.get(REARRANGE_CELLS),
        showError: (message) =>
            void ctx.commands.showError(new UserFacingError("RUN_FAILED", message)),
    };
}

/**
 * Running code on Databricks (RUN-01 to RUN-03, RUN-11): "Upload and Run
 * File" on the attached cluster, "Run File as Workflow" on a cluster or
 * serverless, their debug adapters and launch configurations, and the "Run
 * on Databricks" menus. Both need the project (the upload is the active
 * target's) and the connection.
 */
export const run: Feature = {
    id: "run",
    contextKeys: [SHOW_RUN_AS_WORKFLOW, IS_ACTIVE_FILE_IN_ACTIVE_WORKSPACE],
    telemetryEvents: RUN_EVENTS,
    // They run on the target's compute, which a session window can't choose.
    session: {
        [RUN_EDITOR_CONTENTS]: SESSION_RUN_UNAVAILABLE,
        [RUN_EDITOR_CONTENTS_AS_WORKFLOW]: SESSION_RUN_UNAVAILABLE,
    },

    register(ctx) {
        const { kernel } = ctx;
        const context = runContext(ctx);

        // One panel per file, reused for its next run.
        const panels = new Map<string, WorkflowOutputPanel>();
        // A launch configuration runs the same things, so a window that can't run them refuses it.
        const refused =
            kernel.capabilities.compute === "session"
                ? `${SESSION_RUN_UNAVAILABLE.unavailable} ${SESSION_RUN_UNAVAILABLE.instead}`
                : undefined;
        const workflows = new WorkflowRunner({
            ctx: context,
            panelFor: async (program) => {
                const open = panels.get(program);
                if (open !== undefined && open.visible) {
                    open.reset();
                    open.focus();
                    return open;
                }
                const panel = await WorkflowOutputPanel.create(
                    kernel.extension.asAbsolutePath("."),
                    path.basename(program),
                    ctx.log,
                );
                panels.set(program, panel);
                panel.onDidDispose(() => {
                    if (panels.get(program) === panel) {
                        panels.delete(program);
                    }
                });
                return panel;
            },
            startRecord: () => ctx.telemetry.start(WORKFLOW_RUN),
        });
        const ui = {
            focusDebugConsole: () => context.focusDebugConsole(),
            unavailable: refused,
        };
        ctx.subscriptions.push(
            debug.registerDebugAdapterDescriptorFactory("databricks", {
                createDebugAdapterDescriptor: () =>
                    new DebugAdapterInlineImplementation(new DatabricksDebugSession(context, ui)),
            }),
            debug.registerDebugAdapterDescriptorFactory("databricks-workflow", {
                createDebugAdapterDescriptor: () =>
                    new DebugAdapterInlineImplementation(
                        new WorkflowDebugSession(
                            workflows,
                            (message) => context.showError(message),
                            refused,
                        ),
                    ),
            }),
            { dispose: () => disposeAll([...panels.values()]) },
        );

        ctx.commands.register(
            RUN_EDITOR_CONTENTS,
            (_project, resource?: unknown) => runEditorContents(resource),
            { scope: "project" },
        );
        ctx.commands.register(
            RUN_EDITOR_CONTENTS_AS_WORKFLOW,
            (_project, resource?: unknown) => runEditorContentsAsWorkflow(resource),
            {
                scope: "project",
            },
        );

        // The menus' context keys follow the active editor and the project.
        const update = () => void updateContextKeys(ctx);
        const subscriptions: Disposable[] = [
            window.onDidChangeActiveTextEditor(update),
            window.onDidChangeActiveNotebookEditor(update),
            kernel.project.active.onDidChange(update),
        ];
        ctx.subscriptions.push(...subscriptions);
    },

    start(ctx) {
        void updateContextKeys(ctx);
    },
};

/** Sets `showRunAsWorkflow` and `isActiveFileInActiveWorkspace` for the active editor. */
async function updateContextKeys(ctx: FeatureContext): Promise<void> {
    const uri = targetResource();
    const root = ctx.kernel.project.active.value?.root;
    await Promise.all([
        ctx.kernel.contextKeys.set(SHOW_RUN_AS_WORKFLOW, await canRunAsWorkflow(uri)),
        ctx.kernel.contextKeys.set(IS_ACTIVE_FILE_IN_ACTIVE_WORKSPACE, isInProject(uri, root)),
    ]);
}
