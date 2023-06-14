import {commands, window} from "vscode";

export async function promptForClusterStart() {
    const response = await window.showErrorMessage(
        "The attached cluster is not running.",
        "Start Cluster",
        "Cancel"
    );
    switch (response) {
        case "Start Cluster":
            await commands.executeCommand("databricks.cluster.start");
    }
}

export async function promptForAttachingSyncDest() {
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
    }
}
