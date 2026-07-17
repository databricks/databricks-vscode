import {Disposable, EventEmitter} from "vscode";
import {BundleRemoteState, getResource} from "../models/BundleRemoteStateModel";
import {BundleRunTerminalManager} from "./BundleRunTerminalManager";
import {JobRunStatus} from "./JobRunStatus";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {BundleRunStatus} from "./BundleRunStatus";
import {PipelineRunStatus} from "./PipelineRunStatus";
import {Resource, ResourceKey} from "../types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
/**
 * This class monitors the cli bundle run output and record ids for runs. It also polls for status of the these runs.
 */
export class BundleRunStatusManager implements Disposable {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
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
        resourceType: ResourceKey<BundleRemoteState>,
        additionalArgs: string[] = []
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
        try {
            const result = await this.bundleRunTerminalManager.run(
                resourceKey,
                (data) => remoteRunStatus.parseId(data),
                additionalArgs
            );
            if (result.cancelled) {
                await remoteRunStatus.cancel();
            }
            return result;
        } catch (e) {
            // In the case of a failed run cancellation is expected to fail too.
            // Because of it we catch errors from the `cancel` and log them, re-throwing original error that will be shown to the user.
            await remoteRunStatus.cancel().catch((error) => {
                this.logger.error(
                    "Error while cancelling a run after a failure",
                    error
                );
            });
            remoteRunStatus.runState = "error";
            throw e;
        }
    }

    async cancel(resourceKey: string) {
        this.bundleRunTerminalManager.cancel(resourceKey);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
