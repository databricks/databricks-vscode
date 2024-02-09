import {Uri, EventEmitter} from "vscode";
import {CliWrapper} from "../../cli/CliWrapper";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {Mutex} from "../../locking";

import {BundleTarget, Resource, ResourceKey, Resources} from "../types";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import lodash from "lodash";
import {WorkspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

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
};

/* eslint-enable @typescript-eslint/naming-convention */

export class BundleRemoteStateModel extends BaseModelWithStateCache<BundleRemoteState> {
    public target: string | undefined;
    public authProvider: AuthProvider | undefined;
    protected mutex = new Mutex();

    private readonly stdoutEmitter = new EventEmitter<string>();
    private readonly stderrEmitter = new EventEmitter<string>();
    private readonly errorEmitter = new EventEmitter<unknown>();

    refreshCliListeners = {
        onStdout: this.stdoutEmitter.event,
        onStderr: this.stderrEmitter.event,
        onError: this.errorEmitter.event,
    };

    constructor(
        private readonly cli: CliWrapper,
        private readonly workspaceFolder: Uri,
        private readonly workspaceConfigs: WorkspaceConfigs
    ) {
        super();
    }

    @Mutex.synchronise("mutex")
    public async refresh() {
        return await this.stateCache.refresh();
    }

    @Mutex.synchronise("mutex")
    public async deploy() {
        if (this.target === undefined) {
            throw new Error("Target is undefined");
        }
        if (this.authProvider === undefined) {
            throw new Error("No authentication method is set");
        }

        await this.cli.bundleDeploy(
            this.target,
            this.authProvider,
            this.workspaceFolder,
            this.workspaceConfigs.databrickscfgLocation,
            (data) => this.stdoutEmitter.fire(data),
            (data) => this.stderrEmitter.fire(data)
        );
    }

    public getRunCommand(resourceKey: string) {
        if (this.target === undefined) {
            throw new Error("Target is undefined");
        }
        if (this.authProvider === undefined) {
            throw new Error("No authentication method is set");
        }

        return this.cli.getBundleRunCommand(
            this.target,
            this.authProvider,
            resourceKey,
            this.workspaceFolder,
            this.workspaceConfigs.databrickscfgLocation
        );
    }

    @Mutex.synchronise("mutex")
    public async setTarget(target: string | undefined) {
        if (this.target === target) {
            return;
        }
        this.target = target;
        this.authProvider = undefined;
        await this.stateCache.refresh();
    }

    @Mutex.synchronise("mutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        if (
            !lodash.isEqual(this.authProvider?.toJSON(), authProvider?.toJSON())
        ) {
            this.authProvider = authProvider;
            await this.stateCache.refresh();
        }
    }

    protected async readState(): Promise<BundleRemoteState> {
        if (this.target === undefined || this.authProvider === undefined) {
            return {};
        }

        let output: string;
        try {
            output = await this.cli.bundleSummarise(
                this.target,
                this.authProvider,
                this.workspaceFolder,
                this.workspaceConfigs.databrickscfgLocation,
                undefined,
                (data) => this.stderrEmitter.fire(data)
            );
        } catch (e) {
            this.errorEmitter.fire({e, cmd: "refresh"});
            return {};
        }

        if (output === "" || output === undefined) {
            return {};
        }
        return JSON.parse(output);
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

    dispose() {
        super.dispose();
    }
}
