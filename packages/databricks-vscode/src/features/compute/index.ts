import { env, Uri, window, type Disposable } from "vscode";
import {
    ATTACH_CLUSTER_QUICK_PICK,
    SELECT_SERVERLESS_VERSION,
    START_CLUSTER,
} from "../../kernel/compute/commands";
import type { Connection } from "../../kernel/connection";
import type { Feature, FeatureContext, ProjectSession } from "../../kernel/feature";
import type { ClusterDetails } from "../../kernel/compute/clusters";
import { contextKey } from "../../platform/contextKeys";
import { CancelledError, UserFacingError } from "../../platform/errors";
import { disposeAll, Emitter } from "../../platform/event";
import { setting } from "../../platform/settings";
import { ClusterSection } from "./ClusterSection";
import { pickCompute } from "./ComputePicker";
import { clusterIdOf, COMPUTE_VIEW, ComputeTree, type ClusterFilter } from "./ComputeView";
import { SessionComputeSection } from "./SessionComputeSection";
import { makeServerlessVersionPrompt } from "./serverless/serverlessVersionResolver";
import { COMPUTE_EVENTS, COMPUTE_SELECTED } from "./telemetry";

export const ATTACH_CLUSTER = "databricks.connection.attachCluster";
export const DETACH_CLUSTER = "databricks.connection.detachCluster";
export const CLUSTER_START = START_CLUSTER.id;
export const CLUSTER_STOP = "databricks.cluster.stop";
const CLUSTER_REFRESH = "databricks.cluster.refresh";
const CLUSTER_FILTERS: Readonly<Record<string, ClusterFilter>> = {
    "databricks.cluster.filterByAll": "ALL",
    "databricks.cluster.filterByMe": "ME",
    "databricks.cluster.filterByRunning": "RUNNING",
};

/** The experiments a user opted into. Only `views.cluster` is read; the old unread values are gone. */
const EXPERIMENTS = setting<string[]>("databricks", "experiments.optInto", []);

/** The Compute view shows: `views.cluster` is in `databricks.experiments.optInto`. */
export const SHOW_COMPUTE_VIEW = contextKey<boolean>("databricks.feature.views.cluster");

/** Serverless is the effective compute. "Upload and Run File" is off then. */
export const SERVERLESS = contextKey<boolean>("databricks.context.serverless");

/** Why a session window has no choice of compute, and what to do instead (`Feature.session`). */
const SESSION_COMPUTE_FIXED = {
    unavailable:
        "This window runs on the session's compute, shown in the Connection view, and it can't change.",
    instead:
        "To choose compute for this project's jobs and runs, open the project in a local window.",
} as const;

/** What "Stop Compute" asks before stopping the cluster a session window runs on. */
export const STOP_SESSION_CLUSTER = "Stop it";

/** The resolved mode when validate has run for the target, else the YAML's. */
function targetMode(ctx: FeatureContext, session: ProjectSession): string | undefined {
    const validated = ctx.kernel.bundle.validated.latest;
    if (
        validated?.root === session.project.root &&
        validated.target === session.target &&
        validated.config.bundle?.mode !== undefined
    ) {
        return validated.config.bundle.mode;
    }
    return session.project.config.targets.find((t) => t.name === session.target)?.mode;
}

/** A target to write the choice to, and a connection to list clusters with. */
function requireTarget(ctx: FeatureContext): Connection {
    if (ctx.kernel.project.target.value === undefined) {
        throw new UserFacingError("NO_TARGET", "Select a bundle target first.");
    }
    const connection = ctx.kernel.connection.connection;
    if (connection === undefined) {
        throw new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first.");
    }
    return connection;
}

/**
 * Compute (COMP-01 to COMP-07): "Configure compute", attach and detach, the
 * Cluster row with the cluster override, start and stop, and the
 * experimental Compute view. The state is `kernel.compute`'s. Choosing
 * compute needs the project (it is saved per target); the Compute view and
 * start and stop need only the connection.
 */
export const compute: Feature = {
    id: "compute",
    contextKeys: [SHOW_COMPUTE_VIEW, SERVERLESS],
    telemetryEvents: COMPUTE_EVENTS,
    session: {
        [COMPUTE_VIEW]: { adapted: "It marks the cluster this session runs on." },
        [CLUSTER_REFRESH]: "same",
        ...Object.fromEntries(Object.keys(CLUSTER_FILTERS).map((id) => [id, "same"])),
        [CLUSTER_START]: {
            adapted:
                "Start it from its row in the Compute view: the palette's Start Compute is hidden here.",
        },
        [CLUSTER_STOP]: {
            adapted: "Stopping the cluster this session runs on asks first: it ends the session.",
        },
        // The session's compute is the window's: a saved choice would change what runs, unseen.
        [ATTACH_CLUSTER_QUICK_PICK.id]: SESSION_COMPUTE_FIXED,
        [ATTACH_CLUSTER]: SESSION_COMPUTE_FIXED,
        [DETACH_CLUSTER]: SESSION_COMPUTE_FIXED,
    },

    register(ctx) {
        const { kernel } = ctx;
        const service = kernel.compute;

        const sessionClusterId =
            service.session?.kind === "cluster" ? service.session.clusterId : undefined;

        // The Compute view: listed when it shows, when asked, and for a new connection while it shows.
        const tree = new ComputeTree(
            () => service.clusters.value,
            () => kernel.connection.connection?.userName,
            ctx.log,
            sessionClusterId,
        );
        const view = window.createTreeView(COMPUTE_VIEW, { treeDataProvider: tree.provider });
        const listIfShown = () => {
            if (view.visible && kernel.connection.connection !== undefined) {
                void service.refreshClusters();
            }
        };
        ctx.subscriptions.push(
            view,
            tree,
            service.clusters.onDidChange(() => tree.refresh()),
            view.onDidChangeVisibility(listIfShown),
        );
        ctx.whileConnected(() => listIfShown());

        // The compute a session window runs on, in the Sign-in view; a cluster's name is read once per connection.
        const sessionCompute = service.session;
        if (sessionCompute !== undefined) {
            const changed = new Emitter<void>();
            let details: ClusterDetails | undefined;
            ctx.subscriptions.push(
                changed,
                kernel.connection.state.onDidChange(() => changed.fire()),
                ctx.sections.add(
                    new SessionComputeSection(
                        {
                            session: sessionCompute,
                            host: () => kernel.connection.connection?.host,
                            details: () => details,
                        },
                        changed.event,
                    ),
                ),
            );
            ctx.whileConnected(() => {
                if (sessionClusterId === undefined) {
                    return;
                }
                const controller = new AbortController();
                service
                    .getCluster(sessionClusterId, controller.signal)
                    .then((read) => {
                        details = read;
                        changed.fire();
                    })
                    .catch((e: unknown) => {
                        if (!controller.signal.aborted) {
                            ctx.log.warn(`Can't read the session's cluster ${sessionClusterId}`, e);
                        }
                    });
                return { dispose: () => controller.abort() };
            });
        }

        // The Cluster row, per project session. A session window's compute is the window's: no row.
        ctx.whileProjectSession((session) => {
            if (kernel.capabilities.compute === "session") {
                return;
            }
            const changed = new Emitter<void>();
            const visible = () =>
                kernel.connection.connection !== undefined &&
                targetMode(ctx, session) === "development";
            // The row observes the attached cluster only while it shows, so it is read only then.
            let observing: Disposable | undefined;
            const update = () => {
                if (visible() && observing === undefined) {
                    observing = service.attachedCluster.onDidChange(() => changed.fire());
                } else if (!visible() && observing !== undefined) {
                    observing.dispose();
                    observing = undefined;
                }
                changed.fire();
            };
            const disposables: Disposable[] = [
                changed,
                ctx.sections.add(
                    new ClusterSection(
                        {
                            visible,
                            effective: () => service.effective.value,
                            attached: () => service.attachedCluster.value,
                            useClusterOverride: () =>
                                kernel.project.overrides.value?.useClusterOverride === true,
                            host: () => kernel.connection.connection?.host,
                            setUseClusterOverride: (checked) =>
                                service.setUseClusterOverride(checked).catch((e: unknown) => {
                                    ctx.log.error("Can't save the cluster override", e);
                                    void ctx.commands.showError(
                                        new UserFacingError(
                                            "CLUSTER_OVERRIDE_NOT_SAVED",
                                            `Can't save "Override Jobs cluster in bundle": ${e instanceof Error ? e.message : String(e)}`,
                                            { cause: e },
                                        ),
                                    );
                                }),
                        },
                        changed.event,
                    ),
                ),
                service.effective.onDidChange(update),
                kernel.project.overrides.onDidChange(update),
                kernel.connection.state.onDidChange(update),
                kernel.bundle.validated.onDidChange(update),
            ];
            update();
            return {
                dispose: () => {
                    observing?.dispose();
                    disposeAll(disposables);
                },
            };
        });

        // The `serverless` context key, and `computeSelected` when the effective compute becomes another one.
        let selected: string | undefined;
        const onEffective = () => {
            const effective = service.effective.value;
            void kernel.contextKeys.set(SERVERLESS, effective?.kind === "serverless");
            // The serverless default isn't a choice: it isn't recorded, as no compute was selected.
            const key =
                effective === undefined ||
                (effective.kind === "serverless" && effective.source === "default")
                    ? undefined
                    : effective.kind === "cluster"
                      ? `cluster:${effective.clusterId}`
                      : "serverless";
            if (
                key !== undefined &&
                key !== selected &&
                kernel.connection.connection !== undefined
            ) {
                ctx.telemetry.record(COMPUTE_SELECTED, { type: effective!.kind });
            }
            selected = key;
        };
        ctx.subscriptions.push(service.effective.onDidChange(onEffective));

        // Commands.
        const pickVersion = makeServerlessVersionPrompt({
            getValidateConfig: async () => kernel.bundle.validated.latest?.config,
            projectRoot: () => kernel.project.active.value?.root,
        });
        ctx.commands.register(
            ATTACH_CLUSTER_QUICK_PICK.id,
            (_project, title?: unknown) => {
                const connection = requireTarget(ctx);
                return pickCompute(
                    {
                        compute: service,
                        host: connection.host,
                        pickServerlessVersion: pickVersion,
                        openExternal: (url) => env.openExternal(Uri.parse(url, true)),
                        createQuickPick: () => window.createQuickPick(),
                        log: ctx.log,
                    },
                    // The Cluster row's inline action passes the row.
                    typeof title === "string" ? title : undefined,
                );
            },
            { scope: "project" },
        );
        ctx.commands.registerInternal(SELECT_SERVERLESS_VERSION, async () => {
            requireTarget(ctx);
            const version = await pickVersion();
            if (version !== undefined) {
                await service.setServerlessVersion(version);
            }
            return version;
        });
        ctx.commands.register(
            ATTACH_CLUSTER,
            async (_project, node?: unknown) => {
                requireTarget(ctx);
                const clusterId = clusterIdOf(node);
                if (clusterId === undefined) {
                    throw new UserFacingError(
                        "NO_CLUSTER",
                        "Can't attach cluster. Choose a cluster in the Compute view.",
                    );
                }
                await service.select({ kind: "cluster", clusterId });
            },
            { scope: "project" },
        );
        ctx.commands.register(
            DETACH_CLUSTER,
            async () => {
                if (kernel.project.target.value === undefined) {
                    throw new UserFacingError("NO_TARGET", "Select a bundle target first.");
                }
                await service.select({ kind: "none" });
            },
            { scope: "project" },
        );
        // Without a row, the cluster is the attached one. A session's effective compute is the bundle's, not the window's, so none.
        const clusterFor = (node: unknown): string => {
            const clusterId =
                clusterIdOf(node) ??
                (kernel.capabilities.compute === "perTarget" &&
                service.effective.value?.kind === "cluster"
                    ? service.effective.value.clusterId
                    : undefined);
            if (clusterId === undefined) {
                throw new UserFacingError("NO_CLUSTER", "No cluster is attached.");
            }
            return clusterId;
        };
        ctx.commands.register(
            CLUSTER_START,
            (_connection, node?: unknown) => service.startCluster(clusterFor(node)).then(() => {}),
            {
                scope: "connection",
            },
        );
        ctx.commands.register(
            CLUSTER_STOP,
            async (_connection, node?: unknown) => {
                const clusterId = clusterFor(node);
                if (clusterId === sessionClusterId) {
                    const choice = await window.showWarningMessage(
                        "This window runs on this cluster. Stopping it ends the session.",
                        { modal: true },
                        STOP_SESSION_CLUSTER,
                    );
                    if (choice !== STOP_SESSION_CLUSTER) {
                        throw new CancelledError();
                    }
                }
                await service.stopCluster(clusterId);
            },
            {
                scope: "connection",
            },
        );
        // Signed out there is nothing to list, and no error to show.
        ctx.commands.register(CLUSTER_REFRESH, () => service.refreshClusters());
        for (const [id, filter] of Object.entries(CLUSTER_FILTERS)) {
            ctx.commands.register(id, () => tree.setFilter(filter));
        }

        const showView = () =>
            void kernel.contextKeys.set(
                SHOW_COMPUTE_VIEW,
                kernel.settings.get(EXPERIMENTS).includes("views.cluster"),
            );
        ctx.subscriptions.push(kernel.settings.onDidChange(EXPERIMENTS, showView));
    },

    start(ctx) {
        const { kernel } = ctx;
        void kernel.contextKeys.set(
            SHOW_COMPUTE_VIEW,
            kernel.settings.get(EXPERIMENTS).includes("views.cluster"),
        );
        void kernel.contextKeys.set(
            SERVERLESS,
            kernel.compute.effective.value?.kind === "serverless",
        );
    },
};
