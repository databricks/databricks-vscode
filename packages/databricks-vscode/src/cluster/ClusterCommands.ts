import {ConnectionManager} from "../configuration/ConnectionManager";
import {ClusterFilter, ClusterModel} from "./ClusterModel";

/**
 * Cluster related commands
 */
export class ClusterCommands {
    constructor(
        private clusterModel: ClusterModel,
        readonly connectionManager: ConnectionManager
    ) {}

    /**
     * Refresh cluster tree view by reloading them throug the API
     */
    refreshCommand() {
        return () => {
            this.clusterModel.refresh();
        };
    }

    /**
     * Command to filter clusters in the cluster tree view
     */
    filterCommand(filter: ClusterFilter) {
        return () => {
            this.clusterModel.filter = filter;
        };
    }

    /**
     * Command to start a cluster
     * @param cluster cluster to be started
     */
    async startClusterCommand() {
        await this.connectionManager.startCluster();
    }

    /**
     * Command to stop a cluster
     * @param cluster cluster to be stopped
     */
    async stopClusterCommand() {
        await this.connectionManager.stopCluster();
    }
}
