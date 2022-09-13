import {Cluster} from "@databricks/databricks-sdk";
import {commands, window} from "vscode";

export async function promptForClusterStart(
    cluster: Cluster,
    onReject: () => Promise<void>,
    onAccept: () => Promise<void> = async () => {
        await commands.executeCommand("databricks.cluster.start");
    }
) {
    if (cluster.state !== "RUNNING") {
        const response = await window.showErrorMessage(
            "The attached cluster is not running.",
            "Start Cluster",
            "Cancel Execution"
        );
        switch (response) {
            case "Start Cluster":
                await onAccept();
                return true;
            case "Cancel Execution":
                await onReject();
                return false;
        }
    }
    return true;
}
