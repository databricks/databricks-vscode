import {Disposable} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import {Mutex} from "../locking";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {withOnErrorHandler} from "../utils/onErrorDecorator";

/**
 * Drives the Bundle Resource Explorer in Databricks Remote SSH mode without the
 * normal login flow. Auth comes solely from the ambient environment (resolved
 * by {@link ConnectionManager.connectFromEnvironment}), which deliberately does
 * not touch the ConfigModel. This class bridges that gap: it copies the
 * environment-resolved auth provider onto the ConfigModel so
 * BundleRemoteStateModel can shell out to `bundle summary`.
 *
 * The invariant it enforces is: in remote mode the ConfigModel's auth provider
 * always mirrors the environment. Two things drive that:
 *
 * 1. Re-resolving the target on a project-folder change. In normal mode
 *    ConnectionManager.init() reacts to onDidChangeActiveProjectFolder by
 *    calling setTarget/init; remote mode never runs that init (there's no login
 *    flow and no BundleProjectManager), so we do it here. See the folder-change
 *    listener below.
 * 2. Re-applying auth after {@link ConfigModel.setTarget} clears it. setTarget
 *    wipes the auth provider in its `finally` on every path, so we restore it by
 *    listening to onDidChangeAuthProvider: that event fires from *inside*
 *    setAuthProvider while the config mutex is held, so a re-apply queued from
 *    it runs after the clear rather than racing (and losing) against it - which
 *    is what a naive onDidChangeTarget listener would do.
 *
 * This mirrors normal mode, where ConnectionManager re-resolves the target and
 * re-applies auth (via the login flow) on a folder change.
 */
export class RemoteBundleInitializer implements Disposable {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];
    // Serialises applyEnvAuth so overlapping triggers (the auth-provider
    // listener, the reconnect listener and the trailing initialize() call)
    // can't each fire a `bundle summary`. Only ever acquired before the
    // ConfigModel's own mutex, so there's no lock cycle.
    private readonly applyAuthMutex = new Mutex();
    // Serialises the folder-change handler so two rapid project picks can't
    // interleave their setTarget/init sequences and leave a torn target. Only
    // ever acquired on the folder-change path (never from the auth path), so the
    // lock order stays acyclic: folderChangeMutex -> applyAuthMutex ->
    // ConfigModel's configsMutex.
    private readonly folderChangeMutex = new Mutex();

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        this.disposables.push(
            // Re-apply the environment auth provider whenever setTarget clears
            // it (see class doc), so the resource explorer repopulates.
            this.configModel.onDidChangeAuthProvider(() => {
                void this.applyEnvAuth();
            }),
            // A reconnect (e.g. triggered by the Unity Catalog refresh command)
            // produces a fresh auth provider. Nothing clears the ConfigModel's
            // provider in that case, so re-apply it explicitly to pick up the
            // new credentials.
            this.connectionManager.onDidChangeState((state) => {
                if (state === "CONNECTED") {
                    void this.applyEnvAuth();
                }
            }),
            // Picking a different project folder must re-resolve the target for
            // the new project. Normal mode gets this from ConnectionManager.init(),
            // which remote mode never runs - so drive it here, mirroring that
            // listener. setTarget(undefined) forces a clean transition (so a
            // same-named target across folders still re-resolves and doesn't hit
            // readTarget's early-return); init() then resolves the new folder's
            // target and fires the events that repopulate the tree and (via the
            // auth-provider listener) re-apply auth. The trailing applyEnvAuth()
            // is a deduped safety net. NOTE: setTarget synchronously fires
            // onDidChangeAuthProvider -> applyEnvAuth -> applyAuthMutex, so this
            // handler must not itself hold applyAuthMutex (the non-reentrant
            // Mutex would deadlock); folderChangeMutex is a separate lock.
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(
                withOnErrorHandler(
                    async () => {
                        await this.folderChangeMutex.synchronise(async () => {
                            await this.configModel.setTarget(undefined);
                            await this.configModel.init();
                            await this.applyEnvAuth();
                        });
                    },
                    {log: true, popup: false, throw: false}
                )
            )
        );
    }

    /**
     * Connect from the ambient environment and resolve the bundle target. The
     * environment auth provider is then applied by the onDidChangeAuthProvider
     * listener (setTarget clears auth, which triggers the restore); the trailing
     * applyEnvAuth() is a safety net for the case where the target was already
     * resolved and setTarget fired no event.
     *
     * Safe to call when no project/target exists - the target stays unset and
     * the explorer shows its "select a project" empty state.
     */
    async initialize(): Promise<void> {
        try {
            await this.connectionManager.connectFromEnvironment();
        } catch (e) {
            // connectFromEnvironment already logs; swallow so activation
            // continues and the Unity Catalog view can surface the error.
            this.logger.error(
                "Remote mode: failed to connect for bundle explorer",
                e
            );
        }

        try {
            await this.configModel.init();
        } catch (e) {
            this.logger.error(
                "Remote mode: failed to resolve bundle target",
                e
            );
        }

        await this.applyEnvAuth();
    }

    /**
     * Apply the environment-resolved auth provider to the ConfigModel, but only
     * once a target is set - otherwise BundleRemoteStateModel.readState()
     * short-circuits and there is nothing to authenticate.
     */
    private async applyEnvAuth(): Promise<void> {
        await this.applyAuthMutex.synchronise(async () => {
            if (this.configModel.target === undefined) {
                return;
            }
            const authProvider =
                this.connectionManager.databricksWorkspace?.authProvider;
            if (authProvider === undefined) {
                return;
            }
            // Already applied. connectFromEnvironment reuses the same provider
            // instance until a reconnect creates a new one, so reference
            // equality safely dedupes repeated triggers for the same connection
            // - avoiding a redundant `bundle summary` call and stopping the
            // onDidChangeAuthProvider listener from looping on its own re-apply.
            if (this.configModel.authProvider === authProvider) {
                return;
            }
            try {
                await this.configModel.setAuthProvider(authProvider);
            } catch (e) {
                this.logger.error(
                    "Remote mode: failed to apply environment auth provider",
                    e
                );
            }
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
