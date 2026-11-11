import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/** The old `AutoLoginSource`. Without a project the only source is "init". */
export type AutoLoginSource = "init" | "hostChange" | "targetChange";
/**
 * The old `ManualLoginSource`, without the Auth Type row's "authTypeSwitch"
 * and "authTypeLogin", plus "statusBar" for the new status-bar menu.
 */
export type ManualLoginSource = "command" | "api" | "statusBar";

export const AUTO_LOGIN = telemetryEvent<
    { success: boolean; source: AutoLoginSource } & DurationMeasurement
>("autoLogin", "Extension logged in automatically", {
    success: { comment: "true if the login succeeded" },
    source: { comment: "What started the login" },
    ...durationComment,
});

export const MANUAL_LOGIN = telemetryEvent<
    { success: boolean; source: ManualLoginSource } & DurationMeasurement
>("manualLogin", "User logged in manually", {
    success: { comment: "true if the login succeeded" },
    source: { comment: "Where the user started the login" },
    ...durationComment,
});

export const CONNECTION_STATE_CHANGED = telemetryEvent<{ newState: string }>(
    "connectionStateChanged",
    "State of ConnectionManager has changed",
    { newState: { comment: "The new state of the connection" } },
);

/** Where a profile signed in to the account, not a workspace, turned up. */
export type AccountOnlyProfileWhere = "wizard" | "connect" | "unityGateway";

export const ACCOUNT_ONLY_PROFILE = telemetryEvent<{
    where: AccountOnlyProfileWhere;
    hostMetadata: "unified" | "unavailable";
}>(
    "accountOnlyProfile",
    "A profile signed in to the account on a unified host, but not to a workspace",
    {
        where: {
            comment:
                "wizard: a new profile for a unified host without a workspace ID; connect: the window's connection; unityGateway: Unity Gateway's",
        },
        hostMetadata: {
            comment:
                "unified: the host's metadata says so; unavailable: it couldn't be read, and the connection check was refused",
        },
    },
);

/** How the workspace was chosen; `list` is the account's workspace list. */
export type WorkspaceSelectionSource = "target" | "existingProfile" | "typed" | "list";

export const WORKSPACE_SELECTION = telemetryEvent<{
    source: WorkspaceSelectionSource;
    outcome: "connected" | "failed" | "cancelled";
}>("workspaceSelection", "A workspace was chosen for a profile signed in to the account only", {
    source: {
        comment:
            "target: a bundle target's workspace.host; existingProfile: another profile for the account; typed: an ID or URL the user entered; list: the account's workspace list",
    },
    outcome: {
        comment:
            "connected, failed, or cancelled (dismissed before a workspace was given, or while connecting)",
    },
});

export const CONNECTION_EVENTS = [
    AUTO_LOGIN,
    MANUAL_LOGIN,
    CONNECTION_STATE_CHANGED,
    ACCOUNT_ONLY_PROFILE,
    WORKSPACE_SELECTION,
];
