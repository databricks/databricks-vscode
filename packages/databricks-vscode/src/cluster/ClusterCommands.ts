import {ClusterFilter, ClusterModel} from "./ClusterModel";

/**
 * Cluster related commands
 */
export class ClusterCommands {
    constructor(private clusterModel: ClusterModel) {}

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
}
