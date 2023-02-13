import {commands} from "vscode";

// eslint-disable-next-line @typescript-eslint/naming-convention
export const CustomWhenContext = {
    setLoggedIn(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.loggedIn",
            value
        );
    },

    setActivated(value: boolean) {
        commands.executeCommand(
            "setContext",
            "databricks.context.activated",
            value
        );
    },
};
