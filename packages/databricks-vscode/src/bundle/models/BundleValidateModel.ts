import {BundleWatcher} from "../BundleWatcher";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {Mutex} from "../../locking";
import {CliWrapper} from "../../cli/CliWrapper";
import {BundleTarget} from "../types";
import lodash from "lodash";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {withOnErrorHandler} from "../../utils/onErrorDecorator";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../../logger";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

export type BundleValidateState = {
    clusterId?: string;
    remoteRootPath?: string;
} & BundleTarget;

export class BundleValidateModel extends BaseModelWithStateCache<BundleValidateState> {
    public target: string | undefined;
    public authProvider: AuthProvider | undefined;
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
    }

    public setAuthProvider(authProvider: AuthProvider | undefined) {
        if (
            !lodash.isEqual(this.authProvider?.toJSON(), authProvider?.toJSON())
        ) {
            this.authProvider = authProvider;
        }
    }

    protected async readState(): Promise<BundleValidateState> {
        if (
            !this.target ||
            !this.authProvider ||
            !this.workspaceFolderManager.activeWorkspaceFolder
        ) {
            return {};
        }

        const validateOutput = JSON.parse(
            (
                await this.cli.bundleValidate(
                    this.target,
                    this.authProvider,
                    this.workspaceFolderManager.activeWorkspaceFolder?.uri,
                    workspaceConfigs.databrickscfgLocation,
                    this.logger
                )
            ).stdout
        ) as BundleTarget;

        return {
            clusterId: validateOutput?.bundle?.compute_id,
            remoteRootPath: validateOutput?.workspace?.file_path,
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
