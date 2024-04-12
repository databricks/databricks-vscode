import {Uri} from "vscode";
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
        private readonly workspaceFolder: Uri
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
        if (this.target === undefined || this.authProvider === undefined) {
            return {};
        }

        const validateOutput = JSON.parse(
            await this.cli.bundleValidate(
                this.target,
                this.authProvider,
                this.workspaceFolder,
                workspaceConfigs.databrickscfgLocation,
                this.logger
            )
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
