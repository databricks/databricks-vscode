import { WorkspaceFilesClient } from "@databricks/sdk-workspacefiles/v1";
import { tasks, type Disposable } from "vscode";
import { syncDestination, type SyncDestination } from "../../kernel/bundle/SyncDestination";
import { calls, isNotFound, type Connection } from "../../kernel/connection";
import type { Feature, FeatureContext, ProjectSession } from "../../kernel/feature";
import { contextKey } from "../../platform/contextKeys";
import { disposeAll, Emitter } from "../../platform/event";
import { UserFacingError } from "../../platform/errors";
import { Resource } from "../../platform/reactive";
import { RemoteFolderSection, SHOW_SYNC_ERROR } from "./RemoteFolderSection";
import { SyncSession } from "./SyncSession";

export const SYNC_START = "databricks.sync.start";
export const SYNC_START_FULL = "databricks.sync.startFull";
export const SYNC_STOP = "databricks.sync.stop";

/** The target's mode is `development` (old name). Sync, and the Remote Folder's actions, need it. */
export const IS_DEV_TARGET = contextKey<boolean>("databricks.context.bundle.isDevTarget");

/** The resolved mode when validate has run for the target, else the YAML's (as deploy reads it). */
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

/** Validate's destination for this session's target, while connected. */
function destinationFor(ctx: FeatureContext, session: ProjectSession): SyncDestination | undefined {
    const validated = ctx.kernel.bundle.validated.latest;
    if (
        ctx.kernel.connection.connection === undefined ||
        validated?.root !== session.project.root ||
        validated.target !== session.target
    ) {
        return undefined;
    }
    return syncDestination(validated);
}

/** The folder's page in the workspace, once it exists: `<host>/browse/folders/<id>`, as before. */
async function folderUrl(
    connection: Connection,
    remoteRoot: string,
    signal: AbortSignal,
): Promise<string | undefined> {
    const folder = await connection.api
        .get(WorkspaceFilesClient)
        .getStatus({ path: remoteRoot }, calls.read({ signal }))
        .catch((e: unknown) => {
            if (isNotFound(e)) {
                return undefined;
            }
            throw e;
        });
    return folder?.objectType === "DIRECTORY" && folder.objectId !== undefined
        ? `${connection.host.replace(/\/+$/, "")}/browse/folders/${folder.objectId}`
        : undefined;
}

/** The connection a command needs; the project scope doesn't check it. */
function requireSync(
    ctx: FeatureContext,
    sync: SyncSession | undefined,
    session: ProjectSession | undefined,
): { sync: SyncSession; connection: Connection } {
    if (sync === undefined || session?.target === undefined) {
        throw new UserFacingError("NO_TARGET", "Select a bundle target first.");
    }
    const connection = ctx.kernel.connection.connection;
    if (connection === undefined) {
        throw new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first.");
    }
    if (targetMode(ctx, session) !== "development") {
        throw new UserFacingError(
            "NOT_DEV_TARGET",
            `Sync is only available for targets in development mode. Target "${session.target}" isn't.`,
        );
    }
    return { sync, connection };
}

/**
 * Code sync (SYNC-01, SYNC-02): "Start synchronization", its full variant
 * and "Stop synchronization", run as the task "databricks: sync", and the
 * Remote Folder row with its Path and Sync State. Project scope: a new
 * project or target stops the sync, and so does another connection or a
 * new remote folder, as before.
 */
export const sync: Feature = {
    id: "sync",
    contextKeys: [IS_DEV_TARGET],
    // They need a development target, as locally.
    session: { [SYNC_START]: "same", [SYNC_START_FULL]: "same", [SYNC_STOP]: "same" },

    register(ctx) {
        const { kernel } = ctx;
        let current: { session: ProjectSession; sync?: SyncSession } | undefined;
        /**
         * The sync, kept across project sessions of the same folder and
         * target: an edit to databricks.yml that changes its targets,
         * variables or included files starts a new session, but stopped no
         * sync before.
         */
        let kept: SyncSession | undefined;

        ctx.whileProjectSession((session) => {
            const disposables: Disposable[] = [];
            const changed = new Emitter<void>();
            const target = session.target;
            const updateDevTarget = () =>
                void kernel.contextKeys.set(
                    IS_DEV_TARGET,
                    targetMode(ctx, session) === "development",
                );
            updateDevTarget();
            disposables.push(changed, kernel.bundle.validated.onDidChange(updateDevTarget));
            if (target === undefined) {
                current = { session };
                return { dispose: () => disposeAll(disposables) };
            }
            const syncSession =
                kept ?? new SyncSession({ ...session, target }, kernel, tasks, ctx.log);
            kept = syncSession;
            current = { session, sync: syncSession };

            // The link is loaded when the folder may have appeared or moved, not while rendering.
            const url = new Resource<string | undefined>(async (signal) => {
                const connection = kernel.connection.connection;
                const destination = destinationFor(ctx, session);
                return connection === undefined || destination === undefined
                    ? undefined
                    : folderUrl(connection, destination.remoteRoot, signal);
            });
            let shown: { remoteRoot?: string; api?: unknown } = {};
            const refresh = () => {
                const destination = destinationFor(ctx, session);
                const api = kernel.connection.connection?.api;
                if (destination?.remoteRoot !== shown.remoteRoot || api !== shown.api) {
                    // Syncing to the old folder, or as the old connection, would surprise; the old code stopped too.
                    if (
                        shown.remoteRoot !== undefined ||
                        (syncSession.connection !== undefined && syncSession.connection.api !== api)
                    ) {
                        syncSession.stop();
                    }
                    shown = { remoteRoot: destination?.remoteRoot, api };
                    if (destination === undefined) {
                        url.reset();
                    } else {
                        url.invalidate("remote folder changed");
                    }
                }
                changed.fire();
            };
            disposables.push(
                url,
                url.onDidChange((s) => {
                    if (s.status === "error") {
                        ctx.log.warn("Can't read the remote folder", s.error);
                    }
                    changed.fire();
                }),
                kernel.bundle.validated.onDidChange(refresh),
                kernel.connection.state.onDidChange(refresh),
                // A deploy, or the first sync, creates the folder.
                kernel.bundle.deployed.onDidChange(
                    (s) => s.status === "ready" && url.invalidate("deployed"),
                ),
                syncSession.status.onDidChange((s) => {
                    if (
                        s.state === "WATCHING_FOR_CHANGES" &&
                        url.latest === undefined &&
                        destinationFor(ctx, session) !== undefined
                    ) {
                        url.invalidate("synced");
                    }
                    changed.fire();
                }),
                ctx.sections.add(
                    new RemoteFolderSection(
                        {
                            destination: () => destinationFor(ctx, session),
                            isDevTarget: () => targetMode(ctx, session) === "development",
                            status: () => syncSession.status.value,
                            url: () => url.latest,
                        },
                        changed.event,
                    ),
                ),
            );
            refresh();
            return {
                dispose: () => {
                    // The next session, if any, is already the project's: the sync goes with another folder or target.
                    if (
                        kernel.project.active.value?.root !== session.project.root ||
                        kernel.project.target.value !== target
                    ) {
                        syncSession.dispose();
                        kept = undefined;
                    }
                    disposeAll(disposables);
                    if (current?.sync === syncSession) {
                        current = undefined;
                    }
                },
            };
        });
        ctx.subscriptions.push({
            dispose: () => {
                kept?.dispose();
                kept = undefined;
            },
        });

        const start = async (full: boolean) => {
            const { sync: syncSession, connection } = requireSync(
                ctx,
                current?.sync,
                current?.session,
            );
            await syncSession.start(connection, full);
        };
        ctx.commands.register(SYNC_START, () => start(false), { scope: "project" });
        ctx.commands.register(SYNC_START_FULL, () => start(true), { scope: "project" });
        ctx.commands.register(SYNC_STOP, () => current?.sync?.stop(), { scope: "project" });
        ctx.commands.register(SHOW_SYNC_ERROR, async (reason?: unknown) => {
            // Shown, not thrown: showing the error is what the command is for, not a failure of it.
            await ctx.commands.showError(
                new UserFacingError("SYNC_ERROR", `Sync Error: ${String(reason)}`),
            );
        });
    },
};
