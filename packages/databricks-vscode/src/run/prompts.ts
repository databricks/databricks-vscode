import {commands, window} from "vscode";

export async function promptForClusterAttach() {
    const response = await window.showErrorMessage(
        "Please attach a cluster",
        "Attach Cluster",
        "Cancel"
    );
    switch (response) {
        case "Attach Cluster":
            await commands.executeCommand(
                "databricks.connection.attachClusterQuickPick"
            );
    }
}

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

export async function promptForChangingTargetMode(curMode: string | undefined) {
    const response = await window.showErrorMessage(
        `Running is disabled for non development targets. Current target mode is ${curMode}.`,
        "Change Target Mode",
        "Cancel"
    );
    switch (response) {
        case "Change Target Mode":
            await commands.executeCommand(
                "databricks.connection.bundle.selectTarget"
            );
    }
}
