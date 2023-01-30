import {Cluster} from "@databricks/databricks-sdk";
import {commands, window} from "vscode";

export async function promptForClusterStart(
    cluster: Cluster,
    onReject: () => Promise<void>,
    onAccept: () => Promise<void> = async () => {}
) {
    if (cluster.state !== "RUNNING") {
        const response = await window.showErrorMessage(
            "The attached cluster is not running.",
            "Start Cluster",
            "Cancel"
        );
        switch (response) {
            case "Start Cluster":
                await onAccept();
                await commands.executeCommand("databricks.cluster.start");
                return true;
            case "Cancel":
                await onReject();
                return false;
        }
    }
    return true;
}

export async function promptForAttachingSyncDest(
    onReject: () => Promise<void>,
    onAccept: () => Promise<void> = async () => {}
) {
    const response = await window.showErrorMessage(
        "Please configure a Sync Destination",
        "Configure Sync Destination",
        "Cancel"
    );
    switch (response) {
        case "Configure Sync Destination":
            await commands.executeCommand(
                "databricks.connection.attachSyncDestination"
            );
            await onAccept();
            return true;
        case "Cancel":
            await onReject();
            return false;
    }
}
