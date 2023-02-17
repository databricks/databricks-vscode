import {ConnectionManager} from "../configuration/ConnectionManager";

/**
 * Cluster related commands
 */
export class ClusterCommands {
    constructor(readonly connectionManager: ConnectionManager) {}

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
