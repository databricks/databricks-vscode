import {BundleWatcher} from "../BundleWatcher";
import {
    AuthProvider,
    BundleAuthGuard,
} from "../../configuration/auth/AuthProvider";
import {Mutex} from "../../locking";
import {CliWrapper} from "../../cli/CliWrapper";
import {BundleTarget} from "../types";
import lodash from "lodash";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {withOnErrorHandler} from "../../utils/onErrorDecorator";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

export type BundleValidateState = {
    clusterId?: string;
    remoteRootPath?: string;
    // The bundle deployment engine ("terraform" | "direct"). Not modelled in the
    // generated BundleSchema, so read off the validate output directly.
    engine?: string;
} & BundleTarget;

export class BundleValidateModel extends BaseModelWithStateCache<BundleValidateState> {
    public target: string | undefined;
    public authProvider: AuthProvider | undefined;
    private authGuard: BundleAuthGuard | undefined;
    protected mutex = new Mutex();
    protected logger = logging.NamedLogger.getOrCreate(Loggers.Bundle);

    constructor(
        private readonly bundleWatcher: BundleWatcher,
        private readonly cli: CliWrapper,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        super();
        this.disposables.push(
            this.bundleWatcher.onDidChange(
                withOnErrorHandler(
                    async () => {
                        await this.stateCache.refresh();
                    },
                    {log: true, throw: false}
                )
            )
        );
    }

    public async refresh() {
        await this.stateCache.refresh();
    }

    public setTarget(target: string | undefined) {
        if (this.target === target) {
            return;
        }
        this.target = target;
        this.resetCache();
        this.authProvider = undefined;
        this.authGuard = undefined;
    }

    public setAuthProvider(
        authProvider: AuthProvider | undefined,
        authGuard?: BundleAuthGuard
    ) {
        if (
            !lodash.isEqual(this.authProvider?.toJSON(), authProvider?.toJSON())
        ) {
            this.authProvider = authProvider;
        }
        this.authGuard = authGuard;
    }

    protected async readState(): Promise<BundleValidateState> {
        // Snapshot target + auth + project root before the guard's await: a
        // setTarget / setAuthProvider / folder change that lands during the
        // await must not let the CLI run a target the guard never checked (or
        // with swapped credentials or a different project root).
        const target = this.target;
        const authProvider = this.authProvider;
        const projectRoot = this.workspaceFolderManager.activeProjectUri;
        if (!target || !authProvider || !projectRoot) {
            return {};
        }
        if (this.authGuard && !(await this.authGuard(target)).allowed) {
            return {};
        }

        const validateOutput = JSON.parse(
            (
                await this.cli.bundleValidate(
                    target,
                    authProvider,
                    projectRoot,
                    workspaceConfigs.databrickscfgLocation,
                    this.logger
                )
            ).stdout
        ) as BundleTarget;

        return {
            clusterId:
                validateOutput?.bundle?.compute_id ??
                validateOutput?.bundle?.cluster_id,
            remoteRootPath: validateOutput?.workspace?.file_path,
            engine: (validateOutput?.bundle as {engine?: string} | undefined)
                ?.engine,
            ...validateOutput,
        };
    }

    public resetCache(): void {
        this.stateCache.set({});
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
