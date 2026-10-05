import {Disposable} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import {Mutex} from "../locking";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {withOnErrorHandler} from "../utils/onErrorDecorator";
import {BundleWatcher} from "./BundleWatcher";

/**
 * Remote SSH mode's stand-in for the login flow: pins the environment auth on
 * the ConfigModel on every connect, and resolves the bundle target at startup,
 * on a project-folder change, and when a bundle file appears with no target.
 */
export class RemoteBundleManager implements Disposable {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];
    // Serialises every target resolution so overlapping ones can't leave a
    // torn target.
    private readonly targetMutex = new Mutex();

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly bundleWatcher: BundleWatcher
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
                                authProvider
                            );
                        }
                    },
                    {log: true, throw: false}
                )
            ),
            // setTarget(undefined) forces a clean transition, so a same-named
            // target across folders still re-resolves instead of hitting
            // readTarget's early return.
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(
                withOnErrorHandler(
                    async () => {
                        await this.targetMutex.synchronise(async () => {
                            await this.configModel.setTarget(undefined);
                            await this.configModel.init();
                        });
                    },
                    {log: true, popup: false, throw: false}
                )
            ),
            // With no target, BundlePreValidateModel reads nothing, so nothing
            // else notices a bundle file appearing or gaining targets.
            this.bundleWatcher.onDidChange(
                withOnErrorHandler(
                    async () => {
                        if (this.configModel.target !== undefined) {
                            return;
                        }
                        // A half-written databricks.yml shouldn't pop an error
                        // on every save.
                        const targets = await this.configModel.targets.catch(
                            () => undefined
                        );
                        if (Object.keys(targets ?? {}).length === 0) {
                            return;
                        }
                        await this.targetMutex.synchronise(() =>
                            this.configModel.init()
                        );
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
            this.targetMutex.synchronise(() => this.configModel.init()),
        ]);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
