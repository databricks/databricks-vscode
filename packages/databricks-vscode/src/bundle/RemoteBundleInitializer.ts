import {Disposable} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import {Mutex} from "../locking";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";

/**
 * Drives the Bundle Resource Explorer in Databricks Remote SSH mode without the
 * normal login flow. Auth comes solely from the ambient environment (resolved
 * by {@link ConnectionManager.connectFromEnvironment}), which deliberately does
 * not touch the ConfigModel. This class bridges that gap: it copies the
 * environment-resolved auth provider onto the ConfigModel so
 * BundleRemoteStateModel can shell out to `bundle summary`.
 *
 * The invariant it enforces is: in remote mode the ConfigModel's auth provider
 * always mirrors the environment. {@link ConfigModel.setTarget} clears the auth
 * provider in its `finally` on every path, so whenever the target changes (e.g.
 * because the user picked a different project folder) the auth provider is
 * wiped. We restore it by listening to onDidChangeAuthProvider: that event
 * fires from *inside* setAuthProvider while the config mutex is held, so a
 * re-apply queued from it runs after the clear rather than racing (and losing)
 * against it - which is what a naive onDidChangeTarget listener would do.
 *
 * This mirrors normal mode, where ConnectionManager re-applies auth (via the
 * login flow) after setTarget clears it.
 */
export class RemoteBundleInitializer implements Disposable {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];
    // Serialises applyEnvAuth so overlapping triggers (the auth-provider
    // listener, the reconnect listener and the trailing initialize() call)
    // can't each fire a `bundle summary`. Only ever acquired before the
    // ConfigModel's own mutex, so there's no lock cycle.
    private readonly applyAuthMutex = new Mutex();

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager
    ) {
        this.disposables.push(
            // The target (and therefore the auth provider) is cleared whenever
            // the active project folder changes. Restore the environment auth
            // provider so the resource explorer repopulates for the new project.
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
            })
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
