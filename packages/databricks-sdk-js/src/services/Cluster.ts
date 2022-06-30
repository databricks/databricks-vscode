/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";
import {
    ClusterService,
    GetClusterResponse,
    ClusterState,
} from "../apis/cluster";
import {ExecutionContext} from "./ExecutionContext";

export class Cluster {
    private clusterApi: ClusterService;

    constructor(
        private client: ApiClient,
        private clusterDetails: GetClusterResponse
    ) {
        this.clusterApi = new ClusterService(client);
    }

    get state(): ClusterState {
        return this.clusterDetails.state!;
    }

    get details() {
        return this.clusterDetails;
    }

    async refresh() {
        this.clusterDetails = await this.clusterApi.get({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async start() {
        await this.clusterApi.start({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async stop() {
        await this.clusterApi.delete({
            cluster_id: this.clusterDetails.cluster_id!,
        });
    }

    async waitForState(state: ClusterState) {
        while (true) {
            await this.refresh();

            if (this.clusterDetails.state === state) {
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    async createExecutioncontext(): Promise<ExecutionContext> {
        return await ExecutionContext.create(
            this.client,
            this.clusterDetails.cluster_id!
        );
    }

    async canExecute(): Promise<boolean> {
        let context: ExecutionContext | undefined;
        try {
            context = await this.createExecutioncontext();
            let command = await context.execute("print('hello')");
            await command.response();
            return true;
        } catch (e) {
            return false;
        } finally {
            if (context) {
                await context.destroy();
            }
        }
    }

    static async fromClusterName(
        client: ApiClient,
        clusterName: string
    ): Promise<Cluster | undefined> {
        let clusterApi = new ClusterService(client);
        let clusterList = await clusterApi.listClusters({});
        let cluster = clusterList.clusters?.find((cluster) => {
            return cluster.cluster_name === clusterName;
        });
        if (!cluster) {
            return;
        }

        let response = await clusterApi.get({cluster_id: cluster.cluster_id!});
        return new Cluster(client, response);
    }

    static async fromClusterId(
        client: ApiClient,
        clusterId: string
    ): Promise<Cluster> {
        let clusterApi = new ClusterService(client);
        let response = await clusterApi.get({cluster_id: clusterId});
        return new Cluster(client, response);
    }
}
