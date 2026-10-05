import {CliWrapper} from "../../cli/CliWrapper";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {Mutex} from "../../locking";

import {BundleTarget, Resource, ResourceKey, Resources} from "../types";
import {
    AuthProvider,
    BundleAuthGuard,
} from "../../configuration/auth/AuthProvider";
import lodash from "lodash";
import {WorkspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {CancellationToken} from "vscode";

/* eslint-disable @typescript-eslint/naming-convention */
export type BundleResourceModifiedStatus = "created" | "deleted" | "updated";
export type BundleRemoteState = BundleTarget & {
    resources?: Resources<BundleTarget> & {
        [r in ResourceKey<BundleTarget>]?: {
            [k in keyof Required<Resources<BundleTarget>>[r]]?: Resource<
                BundleTarget,
                r
            > & {
                id?: string;
                modified_status?: BundleResourceModifiedStatus;
            };
        };
    };
    __locations?: {
        version: number;
        files: string[];
        locations: {
            [key: string]: number[][];
        };
    };
};

/* eslint-enable @typescript-eslint/naming-convention */
export function getResource(
    key: string,
    resources?: BundleRemoteState["resources"]
) {
    return key.split(".").reduce((prev: any, k) => {
        if (prev === undefined) {
            return undefined;
        }
        return prev[k];
    }, resources ?? {});
}

export class BundleRemoteStateModel extends BaseModelWithStateCache<BundleRemoteState> {
    public target: string | undefined;
    public authProvider: AuthProvider | undefined;
    private authGuard: BundleAuthGuard | undefined;
    protected mutex = new Mutex();
    private logger = logging.NamedLogger.getOrCreate(Loggers.Bundle);

    get projectRoot() {
        return this.workspaceFolderManager.activeProjectUri;
    }

    constructor(
        private readonly cli: CliWrapper,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly workspaceConfigs: WorkspaceConfigs
    ) {
        super();
    }

    @Mutex.synchronise("mutex")
    public async refresh() {
        return await this.stateCache.refresh();
    }

    @Mutex.synchronise("mutex")
    public async deploy(force = false, token?: CancellationToken) {
        if (this.target === undefined) {
            throw new Error("Target is undefined");
        }
        if (this.authProvider === undefined) {
            throw new Error("No authentication method is set");
        }
        await this.assertAuthAllowed(this.target);

        await this.cli.bundleDeploy(
            this.target,
            this.authProvider,
            this.projectRoot,
            this.workspaceConfigs.databrickscfgLocation,
            this.logger,
            force,
            token
        );
    }

    @Mutex.synchronise("mutex")
    public async destroy(force = false, token: CancellationToken) {
        if (this.target === undefined) {
            throw new Error("Target is undefined");
        }
        if (this.authProvider === undefined) {
            throw new Error("No authentication method is set");
        }
        await this.assertAuthAllowed(this.target);

        await this.cli.bundleDestroy(
            this.target,
            this.authProvider,
            this.projectRoot,
            this.workspaceConfigs.databrickscfgLocation,
            this.logger,
            force,
            token
        );
    }

    @Mutex.synchronise("mutex")
    public async sync(token: CancellationToken) {
        if (this.target === undefined) {
            throw new Error("Target is undefined");
        }
        if (this.authProvider === undefined) {
            throw new Error("No authentication method is set");
        }
        await this.assertAuthAllowed(this.target);

        await this.cli.bundleSync(
            this.target,
            this.authProvider,
            this.projectRoot,
            this.workspaceConfigs.databrickscfgLocation,
            this.logger,
            token
        );
    }

    public async getRunCommand(
        resourceKey: string,
        additionalArgs: string[] = []
    ) {
        if (this.target === undefined) {
            throw new Error("Target is undefined");
        }
        if (this.authProvider === undefined) {
            throw new Error("No authentication method is set");
        }
        await this.assertAuthAllowed(this.target);

        return await this.cli.getBundleRunCommand(
            this.target,
            this.authProvider,
            resourceKey,
            this.projectRoot,
            this.workspaceConfigs.databrickscfgLocation,
            additionalArgs
        );
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

    private async isAuthAllowed(target: string) {
        return this.authGuard === undefined || (await this.authGuard(target));
    }

    private async assertAuthAllowed(target: string) {
        if (!(await this.isAuthAllowed(target))) {
            throw new Error(
                `Bundle commands for target "${target}" are paused because it ` +
                    "deploys to a different workspace than this session. " +
                    "Review the Target row in the Configuration view."
            );
        }
    }

    protected async readState(): Promise<BundleRemoteState> {
        if (
            this.target === undefined ||
            this.authProvider === undefined ||
            !(await this.isAuthAllowed(this.target))
        ) {
            return {};
        }

        const {stdout} = await this.cli.bundleSummarise(
            this.target,
            this.authProvider,
            this.projectRoot,
            this.workspaceConfigs.databrickscfgLocation,
            this.logger
        );

        if (stdout === "" || stdout === undefined) {
            return {};
        }
        return JSON.parse(stdout);
    }

    /**
     * @param key dot separated string that uniquely identifies a resource in the nested resources object
     */
    async getResource(key: string) {
        const resources = await this.get("resources");
        return key.split(".").reduce((prev: any, k) => {
            return prev[k];
        }, resources);
    }

    public resetCache(): void {
        this.stateCache.set({});
    }

    dispose() {
        super.dispose();
    }
}
