import {Disposable, EventEmitter} from "vscode";
import {BundleRemoteState, getResource} from "../models/BundleRemoteStateModel";
import {BundleRunTerminalManager} from "./BundleRunTerminalManager";
import {JobRunStatus} from "./JobRunStatus";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {BundleRunStatus} from "./BundleRunStatus";
import {PipelineRunStatus} from "./PipelineRunStatus";
import {Resource, ResourceKey} from "../types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
/**
 * This class monitors the cli bundle run output and record ids for runs. It also polls for status of the these runs.
 */
export class BundleRunStatusManager implements Disposable {
    private disposables: Disposable[] = [];
    public readonly runStatuses: Map<string, BundleRunStatus> = new Map();

    private readonly onDidChangeEmitter = new EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly bundleRunTerminalManager: BundleRunTerminalManager
    ) {
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this.runStatuses.clear();
                this.onDidChangeEmitter.fire();
            })
        );
    }

    getRunStatusMonitor(
        resourceKey: string,
        resourceType: ResourceKey<BundleRemoteState>,
        authProvider: AuthProvider,
        resource: any
    ): BundleRunStatus {
        switch (resourceType) {
            case "jobs":
                return new JobRunStatus(authProvider);
            case "pipelines": {
                const id = (
                    resource as Resource<BundleRemoteState, "pipelines">
                ).id;
                if (id === undefined) {
                    throw new Error(
                        `Pipeline id is undefined for ${resourceKey}. This likely means the pipeline is not deployed.`
                    );
                }

                return new PipelineRunStatus(authProvider, id);
            }
            default:
                throw new Error(`Unknown resource type ${resourceType}`);
        }
    }

    async run(
        resourceKey: string,
        resourceType: ResourceKey<BundleRemoteState>
    ) {
        const target = this.configModel.target;
        const authProvider = this.configModel.authProvider;
        const resource = getResource(
            resourceKey,
            (await this.configModel.get("remoteStateConfig"))?.resources
        );

        if (target === undefined) {
            throw new Error(`Cannot run ${resourceKey}, Target is undefined`);
        }
        if (authProvider === undefined) {
            throw new Error(
                `Cannot run ${resourceKey}, AuthProvider is undefined`
            );
        }
        if (resource === undefined) {
            throw new Error(
                `Cannot run ${resourceKey}, Resource is not deployed`
            );
        }

        const remoteRunStatus = this.getRunStatusMonitor(
            resourceKey,
            resourceType,
            authProvider,
            resource
        );
        this.runStatuses.set(resourceKey, remoteRunStatus);
        this.disposables.push(
            remoteRunStatus.onDidChange(() => {
                this.onDidChangeEmitter.fire();
            })
        );
        this.onDidChangeEmitter.fire();
        return await this.bundleRunTerminalManager.run(resourceKey, (data) => {
            remoteRunStatus.parseId(data);
        });
    }

    async cancel(resourceKey: string) {
        const runner = this.runStatuses.get(resourceKey);
        this.bundleRunTerminalManager.cancel(resourceKey);
        await runner?.cancel();
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
