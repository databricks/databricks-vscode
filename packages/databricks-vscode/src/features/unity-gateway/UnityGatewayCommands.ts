import { commands as vscodeCommands, ProgressLocation, window, type QuickPickItem } from "vscode";
import {
    CHOOSE_PROFILE,
    RENEW_LOGIN,
    SELECT_UNITY_GATEWAY_WORKSPACE,
    type ProfileFocus,
} from "../../kernel/connection/commands";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import { failureNotice, fixFor, type FixActions } from "../../kernel/connection/fix";
import type { Profiles } from "../../kernel/connection/Profiles";
import type { FeatureCommands } from "../../kernel/feature";
import type { UnityGatewayService } from "../../kernel/unity-gateway/UnityGatewayService";
import {
    CancelledError,
    errorMessage,
    isCancellation,
    UserFacingError,
} from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { SHOW_MENU } from "./UnityGatewayStatusBarItem";

export const SIGN_IN = "databricks.unityGateway.signIn";
export const SIGN_OUT = "databricks.unityGateway.signOut";
/** The Connection view's inline actions: the wizard again, and renewing an expired OAuth session. */
export const SWITCH_WORKSPACE = "databricks.unityGateway.switchWorkspace";
export const SIGN_IN_AGAIN = "databricks.unityGateway.signInAgain";
/** The Connection view's inline action on a profile signed in to the account, not a workspace. */
export const SELECT_WORKSPACE = "databricks.unityGateway.selectWorkspace";
/** The Models row's click: opens Chat's model picker. */
export const CHOOSE_MODEL = "databricks.unityGateway.chooseModel";

/** The Unity Gateway sign-in's commands, in window scope: no folder or workspace sign-in needed. */
export class UnityGatewayCommands {
    private signingIn = false;

    constructor(
        private readonly service: UnityGatewayService,
        private readonly commands: FeatureCommands,
        private readonly profiles: Profiles,
        private readonly log: Logger,
    ) {}

    register(): void {
        this.commands.register(SIGN_IN, () => this.signIn());
        this.commands.register(SIGN_OUT, () => this.signOut());
        this.commands.register(SHOW_MENU, () => this.showMenu());
        this.commands.register(SWITCH_WORKSPACE, () => this.signIn());
        this.commands.register(SIGN_IN_AGAIN, () => this.signInAgain());
        this.commands.register(SELECT_WORKSPACE, () => this.selectWorkspace());
        this.commands.register(CHOOSE_MODEL, () => this.chooseModel());
    }

    /**
     * The shared sign-in wizard (host, then profile), then connects with the
     * profile. Also switches the workspace when already signed in.
     */
    async signIn(): Promise<void> {
        this.ensureAvailable();
        if (this.signingIn) {
            throw new UserFacingError(
                "UNITY_GATEWAY_SIGN_IN_IN_PROGRESS",
                "Databricks: Unity Gateway sign in is already in progress",
            );
        }
        this.signingIn = true;
        try {
            // Undefined when dismissed, or when it failed and showed why.
            const chosen = await this.commands.execute(CHOOSE_PROFILE, {
                ...this.focus(),
                row: "unityGateway",
            });
            if (chosen !== undefined) {
                await this.signInWith(chosen.profile);
            }
        } finally {
            this.signingIn = false;
        }
    }

    /**
     * What the wizard focuses: Unity Gateway's own host and profile, from its
     * connected, connecting or failed state, else the profile it saved.
     * Undefined when it has neither, so the wizard keeps the window's host.
     */
    private focus(): ProfileFocus | undefined {
        const s = this.service.state.value;
        const current =
            s.status === "connected"
                ? { profile: s.connection.profile, host: s.connection.host }
                : s.status === "connecting" || s.status === "error"
                  ? { profile: s.profile, host: s.host }
                  : undefined;
        if (current?.profile !== undefined) {
            return { profile: current.profile, host: current.host ?? this.hostOf(current.profile) };
        }
        const saved = this.service.savedProfile;
        return saved === undefined ? undefined : { profile: saved.profile, host: saved.host };
    }

    /** A profile's host, from the profiles as last read. */
    private hostOf(profile: string): string | undefined {
        return this.profiles.snapshot.latest?.profiles.find((p) => p.name === profile)?.host;
    }

    async signOut(): Promise<void> {
        this.ensureAvailable();
        try {
            await this.service.signOut();
        } catch (e) {
            throw failedWith(
                "UNITY_GATEWAY_SIGN_OUT_FAILED",
                "Error signing out of Unity Gateway.",
                e,
            );
        }
    }

    /**
     * The status-bar item's menu. An expired OAuth session is renewed by
     * signing in with the same profile, which the wizard does.
     */
    async showMenu(): Promise<void> {
        this.ensureAvailable();
        const state = this.service.state.value;
        type Item = QuickPickItem & { run: () => Promise<unknown> };
        const signIn = (label: string): Item => ({ label, run: () => this.signIn() });
        const signOut: Item = {
            label: "$(sign-out) Sign out of Unity Gateway",
            run: () => this.signOut(),
        };
        const items: Item[] = [];
        switch (state.status) {
            case "connected":
                items.push(signIn("$(arrow-swap) Switch Unity Gateway workspace"), signOut);
                break;
            case "error": {
                // The fixes that act on the state; the others are the items below (Reconnect, Sign in).
                const fix = fixFor(state);
                if (fix?.kind === "signInAgain") {
                    items.push({
                        label: `$(refresh) ${fix.title}`,
                        detail: `Profile ${state.profile}`,
                        run: () => this.signInAgain(),
                    });
                }
                if (fix?.kind === "selectWorkspace") {
                    items.push({
                        label: `$(list-selection) ${fix.title}`,
                        detail: `Profile ${state.profile} is signed in to the account, not a workspace`,
                        run: () => this.selectWorkspace(),
                    });
                }
                if (fix?.kind === "selectProfile") {
                    items.push({
                        label: `$(list-selection) ${fix.title}`,
                        run: () => this.signIn(),
                    });
                }
                items.push(
                    {
                        label: "$(refresh) Reconnect",
                        detail: `Profile ${state.profile}`,
                        run: () => this.retry(state),
                    },
                    signIn("$(sign-in) Sign in to Unity Gateway"),
                    signOut,
                );
                break;
            }
            case "connecting":
                items.push(signOut);
                break;
            case "signedOut":
                items.push(signIn("$(sign-in) Sign in to Unity Gateway"));
                break;
        }
        const pick = await window.showQuickPick(items, {
            title: "Unity Gateway connection",
            placeHolder: describe(state),
        });
        if (pick === undefined) {
            throw new CancelledError();
        }
        await pick.run();
    }

    /**
     * Renews the expired OAuth session of Unity Gateway's profile, then
     * reconnects. The row's state may be stale by the time it's clicked:
     * otherwise the menu opens.
     */
    async signInAgain(): Promise<void> {
        this.ensureAvailable();
        const s = this.service.state.value;
        if (s.status !== "error" || s.remedy !== "signInAgain" || !s.profile || !s.host) {
            return this.showMenu();
        }
        await this.commands.execute(RENEW_LOGIN, {
            profile: s.profile,
            host: s.host,
            row: "unityGateway",
        });
        await this.reconnect();
    }

    /**
     * Chooses a workspace for Unity Gateway's profile, signed in to the
     * account only; the connection feature saves it and signs Unity Gateway
     * in. The row's state may be stale by the time it's clicked: otherwise
     * the menu opens.
     */
    async selectWorkspace(): Promise<void> {
        this.ensureAvailable();
        const s = this.service.state.value;
        if (s.status !== "error" || s.remedy !== "selectWorkspace" || !s.profile || !s.host) {
            return this.showMenu();
        }
        await this.commands.execute(SELECT_UNITY_GATEWAY_WORKSPACE, {
            profile: s.profile,
            host: s.host,
        });
    }

    /**
     * Opens Chat, then its model picker. `modelSelector` can't select these
     * models in the Copilot CLI agent, whose picker holds its own copies of
     * them. The picker command isn't in VS Code's documented API, so if it
     * fails, Chat stays open.
     */
    async chooseModel(): Promise<void> {
        this.ensureAvailable();
        try {
            await vscodeCommands.executeCommand("workbench.action.chat.open");
        } catch (e) {
            throw new UserFacingError(
                "UNITY_GATEWAY_CHAT_OPEN_FAILED",
                `Can't open Chat. ${errorMessage(e)}`,
                { cause: e },
            );
        }
        try {
            await vscodeCommands.executeCommand("workbench.action.chat.openModelPicker");
        } catch (e) {
            this.log.error("Can't open Chat's model picker", e);
        }
    }

    /**
     * Signs in with a profile. A failure leaves the row showing it (the
     * service does that), and the notice says why, with the same fix the row's
     * menu offers.
     */
    private async signInWith(profile: string): Promise<void> {
        try {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Databricks: Signing in to Unity Gateway using profile '${profile}'`,
                },
                () => this.service.signIn(profile),
            );
        } catch (e) {
            if (isCancellation(e)) {
                throw e;
            }
            const s = this.service.state.value;
            if (s.status === "error" && s.profile === profile) {
                throw failureNotice(s, profile, this.fixes(profile, s.host));
            }
            throw failedWith(
                "UNITY_GATEWAY_SIGN_IN_FAILED",
                "Error signing in to Unity Gateway.",
                e,
            );
        }
    }

    /**
     * The fixes for a failed sign-in of `profile` on `host`: the notice's
     * button and the menu's items both run these.
     */
    private fixes(profile: string, host: string | undefined): FixActions {
        return {
            signInAgain: async () => {
                await this.commands.execute(RENEW_LOGIN, {
                    profile,
                    host: host!,
                    row: "unityGateway",
                });
                await this.signInWith(profile);
            },
            selectWorkspace: async () => {
                await this.commands.execute(SELECT_UNITY_GATEWAY_WORKSPACE, {
                    profile,
                    host: host!,
                });
            },
            selectProfile: () => this.signIn(),
            retry: () => this.signInWith(profile),
        };
    }

    /**
     * Reconnect for a failed connection: the profile it tried, as the
     * workspace's does, when no profile is saved yet; else the saved one.
     */
    private async retry(state: ConnectionState): Promise<void> {
        if (
            state.status === "error" &&
            state.profile !== undefined &&
            this.service.savedProfile === undefined
        ) {
            await this.signInWith(state.profile);
            return;
        }
        await this.reconnect();
    }

    /** The saved profile again. A restore only logs its failure, so this one shows it. */
    private async reconnect(): Promise<void> {
        const state = await this.service.reconnect();
        if (state.status === "error") {
            throw connectFailure(state, () => this.service.reconnect());
        }
    }

    /** The commands are hidden there too, but `executeCommand` still reaches them. */
    private ensureAvailable(): void {
        if (!this.service.available) {
            throw new UserFacingError(
                "UNITY_GATEWAY_UNAVAILABLE",
                "Unity Gateway isn't available in this window.",
            );
        }
    }
}

/**
 * The error to show when `what` failed with `error`, with the reason after it.
 * A `UserFacingError` keeps its code and actions, so its fix still shows.
 */
function failedWith(code: string, what: string, error: unknown): UserFacingError {
    const own = error instanceof UserFacingError ? error : undefined;
    return new UserFacingError(own?.code ?? code, `${what} ${errorMessage(error)}`, {
        actions: own?.actions ?? [],
        cause: error,
    });
}

/**
 * The notice for a failed Unity Gateway connection, from a restore or a
 * reconnect: the same as a failed workspace connection's, with the row's
 * remedy, run through the command so that its errors are rendered. A host
 * that couldn't be reached gets "Retry", which says why again if it fails.
 */
export function connectFailure(
    state: Extract<ConnectionState, { status: "error" }>,
    reconnect: () => Promise<ConnectionState>,
): UserFacingError {
    return failureNotice(state, state.profile ?? "", restoreActions(state, reconnect));
}

function restoreActions(
    state: Extract<ConnectionState, { status: "error" }>,
    reconnect: () => Promise<ConnectionState>,
): FixActions {
    const command = (id: string) => async () => {
        await vscodeCommands.executeCommand(id);
    };
    return {
        signInAgain: command(SIGN_IN_AGAIN),
        selectWorkspace: command(SELECT_WORKSPACE),
        selectProfile: command(SIGN_IN),
        retry: async () => {
            const next = await reconnect();
            if (next.status === "error") {
                throw connectFailure(next, reconnect);
            }
        },
    };
}

function describe(state: ConnectionState): string {
    switch (state.status) {
        case "connected":
            return `Signed in to Unity Gateway on ${state.connection.host} as ${state.connection.userName}`;
        case "connecting":
            return "Connecting to Unity Gateway…";
        case "signedOut":
            return state.reason;
        default:
            return `Unity Gateway isn't connected. ${state.error.message}`;
    }
}
