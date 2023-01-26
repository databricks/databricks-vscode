import {Doc, UserFacingString} from "./UserFacingStrings";

export const defaultDocs: Doc = new Doc({
    aws: "",
    gcp: "",
    azure: "",
    default: "",
});

export const data = {
    activation: {
        openFolderPrompt: new UserFacingString<undefined>(
            {
                visibleStr: () => `Open a folder to use Databricks extension`,
            },
            defaultDocs,
            "notification.toast.error"
        ),
    },
    bricksTask: {
        noWorkspaceOpened: new UserFacingString<undefined>(
            {
                visibleStr: () => `Can't start sync: No workspace opened!`,
            },
            defaultDocs,
            "notification.toast.error"
        ),
        connectionNotConfigured: new UserFacingString<undefined>(
            {
                visibleStr: () =>
                    `Can't start sync: Databricks connection not configured!`,
            },
            defaultDocs,
            "notification.toast.error"
        ),
        syncDestinationNotConfigured: new UserFacingString<undefined>(
            {
                visibleStr: () =>
                    `Can't start sync: Databricks synchronization destination not configured!`,
            },
            defaultDocs,
            "notification.toast.error"
        ),
    },
    connectionCommands: {
        dirCreationError: new UserFacingString<{e: Error}>(
            {
                visibleStr: (data) =>
                    `Error while creating a new directory: ${data.params?.e.message}`,
            },
            defaultDocs,
            "notification.toast.error"
        ),

        /**
         * Used when we can't find or (in case of files in workspace) create the root
         * sync detination directory.
         * file in repos -> /Repos/me
         * file in workspace -> /Users/me/.ide
         */
        rootDirNotFound: new UserFacingString<{rootDirPath: string}>(
            {
                visibleStr: (data) =>
                    `Can't find or create ${data.params?.rootDirPath}`,
            },
            defaultDocs,
            "notification.toast.error"
        ),

        createCluster: new UserFacingString<undefined>(
            {
                visibleStr: () =>
                    `Open Databricks in the browser and create a new cluster`,
            },
            defaultDocs,
            "quickpick.items.details"
        ),

        createRepo: new UserFacingString<{me: string}>(
            {
                visibleStr: (data) =>
                    `Open Databricks in the browser and create a new repo under /Repo/${data.params?.me}`,
            },
            defaultDocs,
            "quickpick.items.details"
        ),
    },
    configurationView: {
        syncDestination: {
            nameDoesNotMatch: {
                label: new UserFacingString<undefined>(
                    {
                        visibleStr: () =>
                            "The remote sync destination name does not match the current vscode workspace name",
                    },
                    defaultDocs,
                    "treeview.item.details"
                ),
                tooltip: new UserFacingString<undefined>(
                    {
                        visibleStr: () =>
                            "If syncing to directory with a different name is the intended behaviour, this warning can be ignored",
                    },
                    defaultDocs,
                    "tooltip.hover"
                ),
            },
        },
    },
};
