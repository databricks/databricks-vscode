import {Disposable} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {withOnErrorHandler} from "../utils/onErrorDecorator";
import {BundleWatcher} from "./BundleWatcher";
import {RemoteTargetHostManager} from "./RemoteTargetHostManager";

/**
 * Remote SSH mode's stand-in for the login flow: pins the environment auth on
 * the ConfigModel on every connect (sent only to the session's own host unless
 * the user allows another), and keeps the bundle target resolved as folders and
 * bundle files change.
 */
export class RemoteBundleManager implements Disposable {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly bundleWatcher: BundleWatcher,
        private readonly targetHostManager: Pick<
            RemoteTargetHostManager,
            "allowsSessionCredentials" | "onDidChangeAllowedHosts"
        >
    ) {
        this.disposables.push(
            // A reconnect (e.g. from the Unity Catalog refresh command)
            // resolves the same environment credentials into a new provider,
            // which pinAuthProvider skips.
            this.connectionManager.onDidChangeState(
                withOnErrorHandler(
                    async (state: ConnectionState) => {
                        const authProvider =
                            this.connectionManager.databricksWorkspace
                                ?.authProvider;
                        if (state === "CONNECTED" && authProvider) {
                            await this.configModel.pinAuthProvider(
                                authProvider,
                                (targetHost) =>
                                    this.targetHostManager.allowsSessionCredentials(
                                        authProvider.host,
                                        targetHost
                                    )
                            );
                        }
                    },
                    {log: true, throw: false}
                )
            ),
            this.targetHostManager.onDidChangeAllowedHosts(() =>
                this.configModel.reapplyPinnedAuthProvider()
            ),
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(
                withOnErrorHandler(() => this.configModel.reresolveTarget(), {
                    log: true,
                    popup: false,
                    throw: false,
                })
            ),
            // ConfigModel re-resolves a missing target itself. A target that
            // disappears (databricks.yml deleted, or the target removed) is
            // only handled here: in normal mode that would log out and back in
            // during a git checkout.
            this.bundleWatcher.onDidChange(
                withOnErrorHandler(
                    async () => {
                        if (this.configModel.target !== undefined) {
                            await this.configModel.resolveTarget();
                        }
                    },
                    {log: true, throw: false}
                )
            )
        );
    }

    /**
     * Connect from the ambient environment and resolve the bundle target. Safe
     * to call when no project/target exists.
     */
    async initialize(): Promise<void> {
        // Resolving the target only reads local YAML, so it doesn't wait for
        // the connection. init reports its own failures (@onError popup).
        await Promise.all([
            this.connectionManager.connectFromEnvironment().catch((e) => {
                this.logger.error(
                    "Remote mode: failed to connect for bundle explorer",
                    e
                );
            }),
            this.configModel.init(),
        ]);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
