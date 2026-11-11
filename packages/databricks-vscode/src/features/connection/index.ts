import fs from "node:fs";
import path from "node:path";
import { commands as vscodeCommands, window } from "vscode";
import {
    bundledCliMismatchWarning,
    OVERRIDE_CLI_PATH,
    overriddenCliDriftWarning,
} from "../../kernel/cli/CliPaths";
import { cliVersion } from "../../kernel/cli/commands/version";
import { AccountOnlyProfileError } from "../../kernel/connection/accountOnly";
import { CHOOSE_PROFILE } from "../../kernel/connection/commands";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import { sameWorkspace, type WorkspaceRef } from "../../kernel/connection/hostMatching";
import type { Feature, FeatureContext } from "../../kernel/feature";
import { contextKey } from "../../platform/contextKeys";
import type { State } from "../../platform/reactive";
import { setting, settingId } from "../../platform/settings";
import {
    CONFIGURE_LOGIN,
    ConnectionCommands,
    LOGOUT,
    OPEN_CONFIG_FILE,
    SAVE_NEW_PROFILE,
    SELECT_WORKSPACE,
    SIGN_IN_AGAIN,
    SWITCH_PROFILE,
    SWITCH_WORKSPACE,
} from "./ConnectionCommands";
import { ConnectionStatusBarItem, SHOW_CONNECTION_MENU } from "./ConnectionStatusBarItem";
import { UnityGatewayConnectionSection } from "./UnityGatewayConnectionSection";
import { fromTarget, WorkspaceConnectionSection } from "./WorkspaceConnectionSection";
import {
    ACCOUNT_ONLY_PROFILE,
    AUTO_LOGIN,
    CONNECTION_EVENTS,
    CONNECTION_STATE_CHANGED,
    WORKSPACE_SELECTION,
    type AccountOnlyProfileWhere,
} from "./telemetry";

/**
 * The window's connection failed: its failed rows offer sign-out, as the
 * signed-in row does, and the sign-out's enablement needs this as well as
 * `databricks.context.connected`.
 */
export const CONNECTION_FAILED = contextKey<boolean>("databricks.context.connection.failed");

/**
 * Deprecated settings that nothing reads any more. Declared here because the
 * contributed setting must have a declaration in code, as the manifest checks.
 */
const PROXY_STRICT_SSL = setting<boolean | null>("databricks", "proxy.strictSSL", null);
const PROXY_CA_CERT = setting<string>("databricks", "proxy.caCert", "");
/** Each one's replacement, as 2.22.0 named it. */
const DEPRECATED_PROXY_SETTINGS = [
    { setting: PROXY_STRICT_SSL, hint: "Set http.proxyStrictSSL instead." },
    {
        setting: PROXY_CA_CERT,
        hint: "Add the CA to the OS trust store, or start VS Code with NODE_EXTRA_CA_CERTS set to its PEM file.",
    },
];
const OPEN_SETTINGS = "Open Settings";

/** Why a session window can't sign in another way: its identity is the session's. */
const SIGN_IN_FROM_A_SESSION =
    "A session window is signed in with the SSH tunnel's credentials for this workspace, and can't use a profile.";

/**
 * Sign-in and the connection (AUTH-01 to AUTH-07): the status-bar item, the
 * Connection view's rows (the workspace connection, and Unity Gateway's from
 * `kernel.unityGateway`), the sign-in wizard and the connection commands, in
 * window scope.
 */
export const connection: Feature = {
    id: "connection",
    contextKeys: [CONNECTION_FAILED],
    telemetryEvents: CONNECTION_EVENTS,
    session: {
        [CONFIGURE_LOGIN]: {
            unavailable: SIGN_IN_FROM_A_SESSION,
            instead:
                "To use another workspace or profile, open a local window (File > New Window) and sign in there.",
        },
        ...Object.fromEntries(
            [SWITCH_WORKSPACE, SWITCH_PROFILE, SIGN_IN_AGAIN, SELECT_WORKSPACE].map((id) => [
                id,
                {
                    unavailable: SIGN_IN_FROM_A_SESSION,
                    instead:
                        "To use another workspace or profile, open a local window (File > New Window) and sign in there.",
                },
            ]),
        ),
        [LOGOUT]: {
            unavailable: SIGN_IN_FROM_A_SESSION,
            instead: "Close this window to end the session; its credentials go with it.",
        },
        [OPEN_CONFIG_FILE]: {
            unavailable:
                "A session window doesn't read a Databricks configuration file: its credentials come from the SSH tunnel.",
            instead: "Edit your profiles from a local window.",
        },
        [SHOW_CONNECTION_MENU]: {
            adapted:
                "It offers to reconnect, to open the workspace and to copy its host, and nothing that changes the session's identity.",
        },
        // Internal: the profile steps of other features' wizards, and the e2e specs' new profile.
        [CHOOSE_PROFILE.id]: {
            unavailable: SIGN_IN_FROM_A_SESSION,
            instead: "Choose a profile from a local window.",
        },
        [SAVE_NEW_PROFILE]: {
            unavailable: SIGN_IN_FROM_A_SESSION,
            instead: "Create the profile from a local window.",
        },
    },

    register(ctx) {
        const commands = new ConnectionCommands(ctx.kernel, ctx.telemetry, ctx.log);
        commands.register(ctx.commands);
        const { connection: service } = ctx.kernel;
        const gateway = ctx.kernel.unityGateway.available
            ? ctx.kernel.unityGateway.state
            : undefined;
        ctx.subscriptions.push(
            new ConnectionStatusBarItem(service.state),
            ctx.sections.add(
                new WorkspaceConnectionSection(
                    service.state,
                    () => service.project,
                    gateway,
                    ctx.kernel.project.target,
                ),
            ),
        );
        if (gateway !== undefined) {
            ctx.subscriptions.push(
                ctx.sections.add(
                    new UnityGatewayConnectionSection(
                        gateway,
                        service.state,
                        () => service.project,
                    ),
                ),
            );
        }
        const setFailed = (s: ConnectionState) =>
            void ctx.kernel.contextKeys.set(CONNECTION_FAILED, s.status === "error");
        setFailed(service.state.value);
        ctx.subscriptions.push(service.state.onDidChange(setFailed));
        notifyTargetSwitch(ctx);
        notifyFailures(ctx, commands);
        // Through the command, so that its errors are rendered and its telemetry recorded.
        promptWhenAmbiguous(ctx, () => vscodeCommands.executeCommand(CONFIGURE_LOGIN));

        let first = true;
        ctx.subscriptions.push(
            service.onDidAttempt((attempt) => {
                // Manual attempts are recorded by the command, as manualLogin.
                if (!attempt.manual && first) {
                    ctx.telemetry.record(AUTO_LOGIN, {
                        success: attempt.success,
                        source: "init",
                        duration: attempt.duration,
                    });
                }
                first = false;
            }),
        );
        recordAccountOnly(ctx, service.state, "connect");
        if (gateway !== undefined) {
            recordAccountOnly(ctx, gateway, "unityGateway");
        }
        ctx.subscriptions.push(
            service.onDidAttempt((attempt) => {
                if (attempt.fromTargetWorkspace) {
                    ctx.telemetry.record(WORKSPACE_SELECTION, {
                        source: "target",
                        outcome: attempt.success ? "connected" : "failed",
                    });
                }
            }),
        );
        let last: string | undefined;
        ctx.subscriptions.push(
            service.state.onDidChange((s) => {
                const newState = legacyStateName(s);
                if (newState !== last) {
                    last = newState;
                    ctx.telemetry.record(CONNECTION_STATE_CHANGED, { newState });
                }
            }),
        );
    },

    async start(ctx) {
        warnAboutDeprecatedProxySettings(ctx);
        await warnAboutCli(ctx);
    },
};

/**
 * A connection that failed by itself says why, as 2.x did: the row has no
 * room for the reason. Once per failure, until the window connects again; a
 * sign-in the user started shows its own error. A failure is its profile,
 * host and remedy, not its text, which can differ each time (a request ID).
 */
function notifyFailures(ctx: FeatureContext, commands: ConnectionCommands) {
    const { connection: service } = ctx.kernel;
    const notified = new Set<string>();
    ctx.subscriptions.push(
        service.state.onDidChange((s) => {
            if (s.status === "connected") {
                notified.clear();
            }
        }),
        service.onDidAttempt((attempt) => {
            const s = service.state.value;
            if (attempt.manual || attempt.success || s.status !== "error") {
                return;
            }
            const key = JSON.stringify([s.profile, s.host, s.remedy]);
            if (!notified.has(key)) {
                notified.add(key);
                void ctx.commands.showError(commands.failure(s));
            }
        }),
    );
}

/**
 * Several profiles match the target's host: say so, without a modal, and
 * offer the wizard's profile step. Once per set of candidates, so a
 * dismissed prompt doesn't come back until something changes.
 */
function promptWhenAmbiguous(ctx: FeatureContext, pick: () => Thenable<unknown>) {
    const { connection: service } = ctx.kernel;
    let prompted: string | undefined;
    ctx.subscriptions.push(
        service.state.onDidChange((s) => {
            const project = service.project;
            if (s.status !== "signedOut" || s.candidates === undefined || project === undefined) {
                prompted = undefined;
                return;
            }
            const key = JSON.stringify([project.root, project.target, s.candidates]);
            if (key === prompted) {
                return;
            }
            prompted = key;
            const action = "Select a profile";
            void window
                .showInformationMessage(
                    `${s.reason} Select the profile to use for target '${project.target}'.`,
                    action,
                )
                .then((choice) => (choice === action ? pick() : undefined))
                .then(undefined, (e: unknown) => ctx.log.error("Selecting a profile failed", e));
        }),
    );
}

/**
 * Says when a bundle's target moves the window to another workspace than it
 * was on: at open, than your sign-in for windows without a project. Not when
 * the workspace stays the same, nor for a profile the user picked.
 */
function notifyTargetSwitch(ctx: FeatureContext) {
    const { connection: service } = ctx.kernel;
    let before: WorkspaceRef | undefined;
    let beforeProject: string | undefined;
    let first = true;
    ctx.subscriptions.push(
        service.onDidAttempt((attempt) => {
            const c = service.connection;
            if (!attempt.success || c === undefined) {
                return;
            }
            const project = service.project;
            // A manual pick never changes the target, so the key also catches a pick a resolution took for its own.
            const key =
                project?.target !== undefined
                    ? JSON.stringify([project.root, project.target])
                    : undefined;
            const previous = first ? service.noProjectWorkspace() : before;
            const now = { host: c.host, workspaceId: c.workspaceId };
            if (
                !attempt.manual &&
                key !== undefined &&
                key !== beforeProject &&
                fromTarget(c.source) &&
                previous !== undefined &&
                !sameWorkspace(previous, now)
            ) {
                void window.showInformationMessage(
                    `Switched to ${c.profile ?? c.host} to match target ${project!.target}.`,
                );
            }
            first = false;
            before = now;
            beforeProject = key;
        }),
    );
}

/** `accountOnlyProfile`, once per failed connection, for a profile signed in to the account only. */
function recordAccountOnly(
    ctx: FeatureContext,
    state: State<ConnectionState>,
    where: AccountOnlyProfileWhere,
) {
    let recorded: Error | undefined;
    ctx.subscriptions.push(
        state.onDidChange((s) => {
            if (
                s.status === "error" &&
                s.error instanceof AccountOnlyProfileError &&
                s.error !== recorded
            ) {
                recorded = s.error;
                ctx.telemetry.record(ACCOUNT_ONLY_PROFILE, {
                    where,
                    hostMetadata: s.error.hostMetadata,
                });
            }
        }),
    );
}

/** The old `ConnectionManager` state names, so telemetry stays comparable with the old extension's. */
function legacyStateName(state: ConnectionState): string {
    switch (state.status) {
        case "connected":
            return "CONNECTED";
        case "connecting":
            return "CONNECTING";
        default:
            return "DISCONNECTED";
    }
}

/**
 * A repo's settings file can set a deprecated proxy setting in any scope, and
 * it still does nothing: say so, as 2.22.0 did, so the user doesn't trust a CA
 * or a verification choice that isn't in effect.
 */
function warnAboutDeprecatedProxySettings(ctx: FeatureContext) {
    const messages = DEPRECATED_PROXY_SETTINGS.filter(({ setting }) =>
        ctx.kernel.settings.isSetByUser(setting),
    ).map(({ setting, hint }) => `${settingId(setting)} is no longer used. ${hint}`);
    if (messages.length === 0) {
        return;
    }
    const message = messages.join(" ");
    ctx.log.warn(message);
    void window.showWarningMessage(message, OPEN_SETTINGS).then((choice) => {
        if (choice === OPEN_SETTINGS) {
            void vscodeCommands.executeCommand("workbench.action.openSettings", "databricks.proxy");
        }
    });
}

/**
 * INFRA-01: an override that doesn't exist, or an outdated one, in every
 * build; in development, a stale or missing bundled CLI.
 */
async function warnAboutCli(ctx: FeatureContext) {
    const { cli, extension, settings } = ctx.kernel;
    let warning: string | undefined;
    // A bare name is looked up on PATH when it runs, so only a path is checked here.
    if (
        settings.get(OVERRIDE_CLI_PATH) &&
        path.isAbsolute(cli.cliPath) &&
        !fs.existsSync(cli.cliPath)
    ) {
        // cliVersion below returns nothing for a missing file, which would hide why.
        warning = `databricks.overrideDatabricksCLIPath is set to ${cli.cliPath}, but no file exists there. Fix the path, or clear the setting to use the bundled CLI.`;
    } else if (settings.get(OVERRIDE_CLI_PATH)) {
        // The override's check ran with the CLI wrapper's environment in 2.22.0.
        const env = ctx.kernel.childEnv({ connection: null, cli: true });
        const version = await cliVersion(cli, { env });
        warning = version && overriddenCliDriftWarning(version, extension.cliVersion);
    } else if (extension.isDevelopment) {
        // The bundled CLI's check ran with the host environment in 2.22.0.
        const env = ctx.kernel.childEnv({ connection: null, cli: true, environment: "inherited" });
        if (!fs.existsSync(cli.cliPath)) {
            warning = `The bundled Databricks CLI is missing. Run "yarn workspace databricks fetch:cli" and reload the window.`;
        } else {
            warning = bundledCliMismatchWarning(
                (await cliVersion(cli, { env }))?.version,
                extension.cliVersion,
            );
        }
    }
    if (warning !== undefined) {
        ctx.log.warn(warning);
        // An item lets the text wrap.
        void window.showWarningMessage(warning, "Ok");
    }
}
