import { ThemeColor, ThemeIcon, TreeItemCollapsibleState } from "vscode";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { humaniseAuthType } from "./authTypes";

interface RowCommand {
    readonly title: string;
    readonly command: string;
}

/** What differs between the Connection view's rows: the workspace connection, and Unity Gateway's. */
export interface ConnectionRowKind {
    readonly label: string;
    /**
     * The connected row's id; each other state's row is `<id>.<status>`.
     * VS Code applies a row's collapsible state only the first time it sees
     * the id, so the connected row must not inherit the connecting row's.
     */
    readonly id: string;
    /** The menus match `<context>.<status>`, with `.signInAgain` for an expired session and `.selectWorkspace` for a profile signed in to the account only. */
    readonly context: string;
    /** What clicking a connected or failed row opens. */
    readonly menu: RowCommand;
    /** What clicking the signed-out row runs, and its hover. */
    readonly signIn: RowCommand & { readonly tooltip: string };
}

export interface ConnectionRowExtras {
    /** After the profile in the connected row's description. */
    readonly detail?: string;
    /** More lines in the connected and failed rows' hover. */
    readonly notes?: readonly string[];
    /** After every contextValue. */
    readonly contextSuffix?: string;
    /** The signed-out row shows why under it, as a failed row does. */
    readonly reason?: boolean;
}

/**
 * A connection's row: its label, with the profile (the host in remote mode)
 * and how it's doing as the description. Connected, it starts collapsed, with
 * `connectionDetails` a click away, so both connections fit the view; signed
 * out with `reason`, it starts expanded, so the reason shows. Failed, nothing
 * is under it: a reason is often too long for a row, so it's in the hover and
 * in a notification instead.
 * Signed out, a click signs in; otherwise it opens the connection's menu.
 */
export function connectionRow(
    state: ConnectionState,
    kind: ConnectionRowKind,
    extras: ConnectionRowExtras = {},
): ConfigurationItem {
    const suffix = extras.contextSuffix ?? "";
    const notes = extras.notes ?? [];
    switch (state.status) {
        case "signedOut":
            return {
                id: `${kind.id}.signedOut`,
                label: kind.label,
                // Several profiles match a bundle target's workspace: signing in picks one.
                description: state.candidates !== undefined ? "Select a profile" : "Not signed in",
                tooltip: kind.signIn.tooltip,
                iconPath: new ThemeIcon("sign-in"),
                contextValue: `${kind.context}.signedOut${suffix}`,
                ...(extras.reason ? { collapsibleState: TreeItemCollapsibleState.Expanded } : {}),
                command: { title: kind.signIn.title, command: kind.signIn.command },
            };
        case "connecting": {
            const name = state.profile ?? state.host;
            const doing = state.signingIn ? "Signing in…" : "Connecting…";
            return {
                id: `${kind.id}.connecting`,
                label: kind.label,
                description: name !== undefined ? `${name} · ${doing}` : doing,
                iconPath: new ThemeIcon("sync~spin"),
                contextValue: `${kind.context}.connecting${suffix}`,
            };
        }
        case "error": {
            const name = state.profile ?? state.host;
            const status =
                state.remedy === "selectWorkspace"
                    ? "Signed in to the account, not a workspace"
                    : "Can't connect";
            return {
                id: `${kind.id}.error`,
                label: kind.label,
                description: name !== undefined ? `${name} · ${status}` : status,
                tooltip: [
                    state.host ? `Can't connect to ${state.host}` : "Can't connect",
                    state.error.message,
                    ...notes,
                ].join("\n"),
                iconPath: new ThemeIcon("warning"),
                // Only an expired OAuth session is fixed by signing in again, and only a profile signed in to the account by selecting a workspace.
                contextValue: `${kind.context}.error${state.remedy !== undefined ? `.${state.remedy}` : ""}${suffix}`,
                command: kind.menu,
            };
        }
    }
    const c = state.connection;
    return {
        id: kind.id,
        label: kind.label,
        // A session window has no profile: the session's credentials name only the host.
        description: [
            c.profile ?? c.host,
            ...(extras.detail !== undefined ? [extras.detail] : []),
        ].join(" · "),
        tooltip: [
            c.profile === undefined
                ? `Signed in to ${c.host} with the SSH tunnel's credentials`
                : `Signed in to ${c.host} with profile ${c.profile}`,
            ...notes,
        ].join("\n"),
        iconPath: new ThemeIcon("pass-filled", new ThemeColor("debugIcon.startForeground")),
        contextValue: `${kind.context}.connected${suffix}`,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        command: kind.menu,
    };
}

/** The rows under a connection's row, or none: those `connectionDetails` gives, under the row they belong to. */
export function connectionChildren(
    state: ConnectionState,
    kind: ConnectionRowKind,
    parent: ConfigurationItem,
): ConfigurationItem[] {
    return parent.id === kind.id || parent.id === `${kind.id}.signedOut`
        ? connectionDetails(state, kind)
        : [];
}

/** The connected row's host, workspace ID, user and auth type, or the reason under a signed-out one. */
export function connectionDetails(
    state: ConnectionState,
    kind: ConnectionRowKind,
): ConfigurationItem[] {
    if (state.status === "signedOut") {
        return [reasonRow(`${kind.id}.signedOut`, state.reason)];
    }
    if (state.status !== "connected") {
        return [];
    }
    const c = state.connection;
    return [
        {
            label: "Host",
            id: `${kind.id}.workspace`,
            description: c.host,
            iconPath: new ThemeIcon("globe"),
        },
        ...(c.targetWorkspace !== undefined
            ? [
                  {
                      label: `Workspace ${c.targetWorkspace.workspaceId} (from target ${c.targetWorkspace.target})`,
                      id: `${kind.id}.workspaceId`,
                      tooltip: `Target ${c.targetWorkspace.target} names workspace ${c.targetWorkspace.workspaceId} in workspace.host; profile ${c.profile} names none.`,
                      iconPath: new ThemeIcon("target"),
                  },
              ]
            : c.workspaceId !== undefined
              ? [
                    {
                        // A unified host serves several workspaces: the host alone doesn't say which.
                        label: "Workspace",
                        id: `${kind.id}.workspaceId`,
                        description: c.workspaceId,
                        iconPath: new ThemeIcon("briefcase"),
                    },
                ]
              : []),
        {
            label: "User",
            id: `${kind.id}.user`,
            description: c.userName,
            iconPath: new ThemeIcon("account"),
        },
        {
            label: "Auth type",
            id: `${kind.id}.authType`,
            description: humaniseAuthType(c.authType),
            iconPath: new ThemeIcon("key"),
        },
    ];
}

/** The row under a signed-out connection: the reason's first line, all of it on hover. */
function reasonRow(parentId: string, reason: string): ConfigurationItem {
    const [first = reason] = reason.split("\n");
    return {
        label: first,
        id: `${parentId}.reason`,
        tooltip: reason,
        iconPath: new ThemeIcon("info"),
    };
}
