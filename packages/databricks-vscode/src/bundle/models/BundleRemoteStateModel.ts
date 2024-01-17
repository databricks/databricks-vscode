import {Uri} from "vscode";
import {CliWrapper} from "../../cli/CliWrapper";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {Mutex} from "../../locking";

import {BundleTarget} from "../types";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import lodash from "lodash";
import {WorkspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

/* eslint-disable @typescript-eslint/naming-convention */
type Resources = Required<BundleTarget>["resources"];
type Resource<K extends keyof Required<Resources>> = Required<Resources>[K];

export type InternalBundleTargetSchema = BundleTarget & {
    resources?: Resources & {
        [r in keyof Resources]?: {
            [k in keyof Resource<r>]?: Resource<r>[k] & {
                id?: string;
                modified_status?: "CREATED" | "DELETED" | "UPDATED";
            };
        };
    };
};
/* eslint-enable @typescript-eslint/naming-convention */

export class BundleRemoteStateModel extends BaseModelWithStateCache<InternalBundleTargetSchema> {
    private target: string | undefined;
    private authProvider: AuthProvider | undefined;
    protected mutex = new Mutex();

    constructor(
        private readonly cli: CliWrapper,
        private readonly workspaceFolder: Uri,
        private readonly workspaceConfigs: WorkspaceConfigs
    ) {
        super();
    }

    public async init() {
        await this.stateCache.refresh();
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

    protected async readState(): Promise<InternalBundleTargetSchema> {
        if (this.target === undefined || this.authProvider === undefined) {
            return {};
        }

        return JSON.parse(
            await this.cli.bundleSummarise(
                this.target,
                this.authProvider,
                this.workspaceFolder,
                this.workspaceConfigs.databrickscfgLocation
            )
        );
    }
}
