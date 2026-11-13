import fs from "node:fs/promises";
import path from "node:path";
import {
    commands as vscodeCommands,
    env,
    ProgressLocation,
    Uri,
    window,
    workspace,
    type QuickInput,
    type QuickPickItem,
} from "vscode";
import { CliError } from "../../kernel/cli/Cli";
import { authLogin, authToken } from "../../kernel/cli/commands/auth";
import type { ChildEnvironment } from "../../kernel/cli/childEnv";
import { configure } from "../../kernel/cli/commands/configure";
import {
    CHOOSE_PROFILE,
    CONFIGURE_LOGIN,
    CONNECTED_PROFILE,
    RENEW_LOGIN,
    SELECT_UNITY_GATEWAY_WORKSPACE,
    type ChosenProfile,
    type ConnectedProfile,
    type ProfileFocus,
    type SignInRow,
} from "../../kernel/connection/commands";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { ProfilesSnapshot } from "../../kernel/connection/Profiles";
import { failureNotice, fixFor, type FixActions } from "../../kernel/connection/fix";
import type { Kernel, FeatureCommands } from "../../kernel/feature";
import { SELECT_TARGET } from "../../kernel/project/commands";
import type { TelemetryRecorder } from "../../kernel/telemetry";
import {
    CancelledError,
    errorMessage,
    isCancellation,
    UserFacingError,
} from "../../platform/errors";
import type { Logger } from "../../platform/log";
import type { QuickInputFactory } from "../../platform/ui/quickPick";
import { RESTART_SESSION, SHOW_CONNECTION_MENU } from "./ConnectionStatusBarItem";
import { runSignInWizard, type SignInChoice } from "./SignInWizard";
import {
    ACCOUNT_ONLY_PROFILE,
    MANUAL_LOGIN,
    WORKSPACE_SELECTION,
    type ManualLoginSource,
    type WorkspaceSelectionSource,
} from "./telemetry";
import { chooseWorkspace, type ExistingProfileChoice } from "./WorkspaceChoice";

export { CONFIGURE_LOGIN };
/** Unity Gateway's own sign-in wizard: the same steps, titled for the connection they sign in. */
const UNITY_GATEWAY_TITLE = "Sign in to Unity Gateway";
export const LOGOUT = "databricks.connection.logout";
/** The Connection view's inline switch: the sign-in wizard, under a name for the row. */
export const SWITCH_WORKSPACE = "databricks.connection.switchWorkspace";
/** The same in a project, where the wizard offers only the profiles for the target's workspace. */
export const SWITCH_PROFILE = "databricks.connection.switchProfile";
/** The Connection view's inline action on an expired session. */
export const SIGN_IN_AGAIN = "databricks.connection.signInAgain";
/** The Connection view's inline action on a profile signed in to the account, not a workspace. */
export const SELECT_WORKSPACE = "databricks.connection.selectWorkspace";
export const OPEN_CONFIG_FILE = "databricks.connection.openDatabricksConfigFile";
/**
 * Not contributed: the e2e specs call it to create a profile without putting
 * a token on screen. It copies the current PAT connection
 * into a new profile, through `databricks configure`.
 */
export const SAVE_NEW_PROFILE = "databricks.connection.saveNewProfile";

/** The command handlers of the connection feature. All UI for auth lives here. */
export class ConnectionCommands {
    /** The sign-in under way, settled when it ends however it ends. */
    private signingIn?: Promise<void>;
    /** The wizard's input while it's on screen: a second sign-in closes it and starts over. */
    private openInput?: QuickInput;

    constructor(
        private readonly kernel: Kernel,
        private readonly telemetry: TelemetryRecorder,
        private readonly log: Logger,
        private readonly factory?: QuickInputFactory,
    ) {}

    register(commands: FeatureCommands): void {
        // The status bar's sign-in passes "statusBar", so its telemetry says where the sign-in started.
        commands.register(CONFIGURE_LOGIN, (source?: unknown) =>
            this.configureLogin(source === "statusBar" ? "statusBar" : "command"),
        );
        commands.register(SWITCH_WORKSPACE, () => this.configureLogin("command"));
        commands.register(SWITCH_PROFILE, () => this.configureLogin("command"));
        commands.register(SIGN_IN_AGAIN, () => this.signInAgainFromRow());
        commands.register(SELECT_WORKSPACE, () => this.selectWorkspaceFromRow());
        commands.registerInternal(SELECT_UNITY_GATEWAY_WORKSPACE, async ({ profile, host }) => {
            await this.exclusively(() => this.selectWorkspace(profile, host, "unityGateway"));
        });
        commands.registerInternal(RENEW_LOGIN, async ({ profile, host, row }) => {
            await this.login(host, profile, { row });
            // The window's connection failed on the same session: it reconnects too.
            const s = this.kernel.connection.state.value;
            if (s.status === "error" && s.profile === profile) {
                await this.kernel.connection.reconnect();
            }
        });
        commands.register(LOGOUT, () => this.logout());
        commands.register(OPEN_CONFIG_FILE, () => this.openConfigFile());
        commands.register(SAVE_NEW_PROFILE, (name: string) => this.saveNewProfile(name));
        commands.register(SHOW_CONNECTION_MENU, () => this.showMenu());
        commands.registerInternal(CHOOSE_PROFILE, (focus) => this.chooseProfile(focus));
        commands.registerInternal(CONNECTED_PROFILE, () => this.connectedProfile());
    }

    /**
     * The sign-in wizard, then whatever the user chose. `host` skips the host
     * step, as "Switch profile" does. In a project the target's host is
     * known, so the wizard starts with the profiles for it (`auth.e2e.ts`
     * looks for them in the first input). `retried`, a failed sign-in's
     * choice, skips the wizard: its Retry is otherwise a sign-in like the first.
     */
    async configureLogin(
        source: ManualLoginSource,
        host?: string,
        retried?: SignInChoice,
    ): Promise<void> {
        const record = this.telemetry.start(MANUAL_LOGIN);
        let success = false;
        try {
            success = await this.exclusively(async () => {
                const { connection } = this.kernel;
                if (connection.project !== undefined && connection.project.target === undefined) {
                    // The profile is saved for the target, so the target comes first. A dismissed picker is silent.
                    await vscodeCommands.executeCommand(SELECT_TARGET);
                    if (connection.project?.target === undefined) {
                        throw new CancelledError();
                    }
                }
                const project = connection.project;
                const signedOut = connection.state.value.status === "signedOut";
                const choice =
                    retried ??
                    (await this.runWizard({
                        host:
                            host ??
                            (project !== undefined ? hostOf(connection.state.value) : undefined),
                        suggestedName: project?.target,
                        targetProfile: project?.workspaceProfile,
                    }));
                const connected = await this.carryOut(choice, source);
                if (connected && signedOut) {
                    this.signInUnityGatewayToo();
                }
                return connected;
            });
        } finally {
            record({ success, source });
        }
    }

    /**
     * Signed out of both, a sign-in by hand starts over: Unity Gateway signs
     * in with the same profile too, as on the first sign-in. Not when it's
     * signed in or connecting, for example to the first sign-in's copy. Its
     * failure doesn't fail this sign-in: its row says it isn't signed in.
     */
    private signInUnityGatewayToo(): void {
        const { connection, unityGateway } = this.kernel;
        const profile = connection.connection?.profile;
        if (
            !unityGateway.available ||
            unityGateway.state.value.status !== "signedOut" ||
            profile === undefined
        ) {
            return;
        }
        unityGateway.signIn(profile).catch((e: unknown) => {
            if (!(e instanceof CancelledError)) {
                this.log.warn(`Unity Gateway didn't sign in with profile ${profile}`, e);
            }
        });
    }

    /**
     * `CHOOSE_PROFILE`: the host step, preselected, then the profiles for that
     * host, whatever the window is connected to. `focus` is the caller's own
     * host and profile, which the wizard focuses instead of the window's host.
     * A new profile is created, an expired OAuth session renewed; the window's
     * connection doesn't change.
     */
    async chooseProfile(focus?: ProfileFocus): Promise<ChosenProfile> {
        return this.exclusively(async () => {
            const choice = await this.runWizard({ focus });
            let name: string;
            switch (choice.kind) {
                case "editConfigFile":
                    await this.openConfigFile();
                    throw new CancelledError();
                case "existing":
                    name = choice.profile.name;
                    if (
                        choice.profile.authType === "databricks-cli" &&
                        choice.profile.host !== undefined
                    ) {
                        await this.renewIfExpired(name, choice.profile.host, focus?.row);
                    }
                    break;
                default:
                    await this.createProfile(choice, focus?.row);
                    name = choice.profile;
            }
            const snapshot = await this.kernel.connection.profiles.refresh("profile chosen");
            const info = snapshot.profiles.find((p) => p.name === name);
            if (info?.host === undefined) {
                throw new UserFacingError(
                    "PROFILE_NOT_FOUND",
                    `Can't find a host for the profile ${name}.`,
                );
            }
            return { profile: name, host: info.host, authType: info.authType };
        });
    }

    /**
     * `CONNECTED_PROFILE`. The browser login that renews an expired session
     * shows on no row, so the window stays as it is whether it works, is
     * dismissed or fails; once it works, the CLI's next token is fresh.
     */
    async connectedProfile(): Promise<ConnectedProfile> {
        const before = this.usableConnection();
        if (before === undefined) {
            return {};
        }
        if (before.authType === "databricks-cli" && (await this.sessionExpired(before.profile))) {
            await this.exclusively(() => this.login(before.host, before.profile));
            // A login takes up to 5 minutes: the window may have switched meanwhile.
            const after = this.usableConnection();
            if (after?.profile !== before.profile || after.host !== before.host) {
                return {};
            }
        }
        return { profile: before };
    }

    /** The window's connected profile, when it names a workspace of its own. */
    private usableConnection(): ChosenProfile | undefined {
        const connection = this.kernel.connection.connection;
        // A profile signed in to the account only connects through the target's workspace.
        if (connection?.profile === undefined || connection.targetWorkspace !== undefined) {
            return undefined;
        }
        return {
            profile: connection.profile,
            host: connection.host,
            authType: connection.authType,
        };
    }

    /**
     * One wizard at a time: they would fight over the quick input. Another
     * sign-in while the wizard is open starts it over: VS Code can't give an
     * open input the focus back (`show()` does nothing to a visible one), and
     * a new input takes it. Past the wizard, while signing in, it says so.
     */
    private async exclusively<T>(run: () => Promise<T>): Promise<T> {
        if (this.signingIn !== undefined) {
            if (this.openInput === undefined) {
                throw new UserFacingError(
                    "SIGN_IN_IN_PROGRESS",
                    "Databricks: sign in is already in progress",
                );
            }
            // Hiding the input cancels that wizard, silently; start over once it has ended.
            const ending = this.signingIn;
            this.openInput.hide();
            await ending;
            if (this.signingIn === ending) {
                this.signingIn = undefined;
            }
            return this.exclusively(run);
        }
        const result = run();
        const settled = result.then(
            () => undefined,
            () => undefined,
        );
        this.signingIn = settled;
        try {
            return await result;
        } finally {
            if (this.signingIn === settled) {
                this.signingIn = undefined;
            }
        }
    }

    private async runWizard(options: {
        host?: string;
        suggestedName?: string;
        targetProfile?: string;
        focus?: ProfileFocus;
    }): Promise<SignInChoice> {
        const { connection } = this.kernel;
        const snapshot = await this.readProfiles("sign-in wizard");
        try {
            return await runSignInWizard({
                profiles: snapshot.profiles,
                title: options.focus?.row === "unityGateway" ? UNITY_GATEWAY_TITLE : undefined,
                host: options.host,
                suggestedName: options.suggestedName,
                targetProfile: options.targetProfile,
                preselectHost: options.focus?.host ?? hostOf(connection.state.value),
                preselectProfile: options.focus?.profile,
                envHost: process.env.DATABRICKS_HOST,
                openPatPage: (url) => void env.openExternal(Uri.parse(url)),
                hostMetadata: (host) => connection.hostMetadata.get(host),
                onAccountOnly: () =>
                    this.telemetry.record(ACCOUNT_ONLY_PROFILE, {
                        where: "wizard",
                        hostMetadata: "unified",
                    }),
                openExternal: (url) => void env.openExternal(Uri.parse(url)),
                factory: this.trackingFactory(),
            });
        } finally {
            // The wizard is done; what follows (a browser login, connecting) has no input to bring back.
            this.openInput = undefined;
        }
    }

    /** The config file's profiles, read now. */
    private async readProfiles(reason: string): Promise<ProfilesSnapshot> {
        try {
            return await this.kernel.connection.profiles.refresh(reason);
        } catch (e) {
            // The old wizard's remedy: a file the CLI can't parse either, so only an edit fixes it.
            throw new UserFacingError(
                "CONFIG_FILE_UNREADABLE",
                `Can't read the Databricks config file ${this.kernel.configFile()}: ${errorMessage(e)}`,
                {
                    cause: e,
                    actions: [
                        { title: "Open Databricks Config File", run: () => this.openConfigFile() },
                    ],
                },
            );
        }
    }

    /** `factory`, remembering the input each step shows until it's hidden or disposed. */
    private trackingFactory(): QuickInputFactory {
        const factory = this.factory ?? window;
        const track = <I extends QuickInput>(input: I): I => {
            this.openInput = input;
            input.onDidHide(() => {
                if (this.openInput === input) {
                    this.openInput = undefined;
                }
            });
            return input;
        };
        return {
            createQuickPick: <T extends QuickPickItem>() => track(factory.createQuickPick<T>()),
            createInputBox: () => track(factory.createInputBox()),
        };
    }

    private async carryOut(choice: SignInChoice, source: ManualLoginSource): Promise<boolean> {
        switch (choice.kind) {
            case "editConfigFile":
                await this.openConfigFile();
                return false;
            case "oauth":
            case "pat":
                if (choice.kind === "pat") {
                    await this.checkToken(choice, source);
                    await this.refuseTakenName(choice.profile);
                }
                await this.createProfile(choice, "workspace");
                return this.recordSelection(
                    choice.kind === "oauth" ? choice.workspaceSelection : undefined,
                    this.connect(choice.profile),
                );
            case "existing":
                return this.recordSelection(
                    choice.workspaceSelection,
                    this.connect(choice.profile.name, choice.profile.host),
                );
        }
    }

    /** As the old wizard did: a token that doesn't work isn't saved, and the window keeps its connection. */
    private async checkToken(
        choice: Extract<SignInChoice, { kind: "pat" }>,
        source: ManualLoginSource,
    ): Promise<void> {
        try {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Databricks: Checking the Personal Access Token",
                },
                () => this.kernel.connection.checkToken(choice.host, choice.token, choice.profile),
            );
        } catch (e) {
            throw new UserFacingError(
                "PAT_CHECK_FAILED",
                `Can't login with the provided Personal Access Token: ${errorMessage(e)}`,
                {
                    cause: e,
                    actions: [
                        {
                            title: "Retry",
                            run: () => this.configureLogin(source, undefined, choice),
                        },
                    ],
                },
            );
        }
    }

    /**
     * `configure` merges into a section of the same name, replacing its
     * credentials. The wizard checked the name before the token check; a
     * Retry may come after another sign-in saved a profile under it.
     */
    private async refuseTakenName(profile: string): Promise<void> {
        const { profiles } = await this.readProfiles("before saving a token");
        if (profiles.some((p) => p.name === profile)) {
            throw new UserFacingError(
                "PROFILE_EXISTS",
                `Profile ${profile} exists now. Sign in again to choose another name.`,
            );
        }
    }

    /** `workspaceSelection` for a workspace the wizard's workspace step chose, once connecting settles. */
    private async recordSelection(
        source: WorkspaceSelectionSource | undefined,
        connecting: Promise<true>,
    ): Promise<true> {
        if (source === undefined) {
            return connecting;
        }
        try {
            await connecting;
        } catch (e) {
            this.telemetry.record(WORKSPACE_SELECTION, {
                source,
                outcome: isCancellation(e) ? "cancelled" : "failed",
            });
            throw e;
        }
        this.telemetry.record(WORKSPACE_SELECTION, { source, outcome: "connected" });
        return true;
    }

    /**
     * Through the CLI only: `auth login` for OAuth, `configure` for a
     * token. `row` is the connection the sign-in is for, if any.
     */
    private async createProfile(
        choice: Extract<SignInChoice, { kind: "oauth" | "pat" }>,
        row?: SignInRow,
    ): Promise<void> {
        if (choice.kind === "oauth") {
            await this.login(choice.host, choice.profile, {
                workspaceId: choice.workspaceId,
                row,
            });
        } else {
            await configure(this.kernel.cli, choice, { env: this.signedOutEnv("hostAndProxy") });
        }
    }

    /** An OAuth profile whose session expired signs in again, as the old `DatabricksCliCheck` did. */
    private async renewIfExpired(profile: string, host: string, row?: SignInRow): Promise<void> {
        if (await this.sessionExpired(profile)) {
            await this.login(host, profile, { row });
        }
    }

    /** True when the CLI can't produce a token for the OAuth profile, so only a browser login renews it. */
    private async sessionExpired(profile: string): Promise<boolean> {
        try {
            await authToken(this.kernel.cli, profile, { env: this.signedOutEnv("inherited") });
            return false;
        } catch (e) {
            if (!(e instanceof CliError)) {
                throw e;
            }
            this.log.info(
                `The OAuth session of profile ${profile} has expired; signing in again`,
                e,
            );
            return true;
        }
    }

    /**
     * A browser login for `profile`. With `row`, that connection's row shows
     * the sign-in while it runs (`duringSignIn`); without one, nothing does.
     */
    private login(
        host: string | undefined,
        profile: string,
        options: { readonly workspaceId?: string; readonly row?: SignInRow } = {},
    ): Promise<void> {
        const run = () => this.browserLogin(host, profile, options.workspaceId);
        switch (options.row) {
            case undefined:
                return run();
            case "workspace":
                return this.kernel.connection.signingInWith(profile, host, run);
            case "unityGateway":
                return this.kernel.unityGateway.signingInWith(profile, host, run);
        }
    }

    /** `databricks auth login`, with a cancellable notification. */
    private async browserLogin(
        host: string | undefined,
        profile: string,
        workspaceId?: string,
    ): Promise<void> {
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Databricks: Logging in using OAuth U2M",
                cancellable: true,
            },
            async (_progress, token) => {
                const controller = new AbortController();
                const subscription = token.onCancellationRequested(() => controller.abort());
                try {
                    await authLogin(
                        this.kernel.cli,
                        { host, profile, workspaceId },
                        { env: this.signedOutEnv("inherited"), signal: controller.signal },
                    );
                } finally {
                    subscription.dispose();
                }
            },
        );
    }

    /**
     * Connects with the profile and saves it as the choice. An expired OAuth
     * session signs in again first, as the old `DatabricksCliCheck` did.
     */
    private async connect(profile: string, host?: string): Promise<true> {
        const { connection } = this.kernel;
        // Choosing the profile saves it before any browser login it may need: a cancelled sign-in gives the choice back.
        const before = connection.savedChoice();
        let state = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Databricks: Logging in using Profile '${profile}'`,
            },
            () => connection.useProfile(profile),
        );
        try {
            if (
                state.status === "error" &&
                state.remedy === "signInAgain" &&
                (host ?? state.host) !== undefined
            ) {
                await this.login((host ?? state.host)!, profile, { row: "workspace" });
                state = await connection.reconnect();
            }
            if (
                state.status === "error" &&
                state.remedy === "selectWorkspace" &&
                state.host !== undefined
            ) {
                // A sign-in the user started: ask at once, rather than leave it to the row.
                return await this.selectWorkspace(profile, state.host, "workspace");
            }
        } catch (e) {
            if (isCancellation(e)) {
                await connection.restoreChoice(before);
            }
            throw e;
        }
        if (state.status !== "connected") {
            throw this.connectError(profile, state);
        }
        return true;
    }

    /**
     * The notice for a connection that failed by itself: at start, for a
     * target, or after the config file changed. A sign-in shows the same
     * when it fails. A session's credentials have no profile to name.
     */
    failure(state: Extract<ConnectionState, { status: "error" }>): UserFacingError {
        if (state.profile === undefined) {
            const restart = state.remedy === "restartSession" ? ` ${RESTART_SESSION}` : "";
            return new UserFacingError(
                "SESSION_NOT_CONNECTED",
                `Can't connect with the session's credentials: ${state.error.message}${restart}`,
            );
        }
        return this.connectError(state.profile, state);
    }

    private connectError(profile: string, state: ConnectionState): UserFacingError {
        if (state.status === "error") {
            return failureNotice(state, profile, this.fixes(profile, state.host));
        }
        const reason = state.status === "signedOut" ? state.reason : state.status;
        return new UserFacingError(
            "LOGIN_FAILED",
            `Can't login with config profile ${profile}: ${reason}`,
        );
    }

    /**
     * The workspace connection's fixes for `profile` on `host`: the notice's
     * button and the menu's items both run these, so they agree.
     */
    private fixes(profile: string, host: string | undefined): FixActions {
        return {
            signInAgain: () => this.signInAgain(profile, host!),
            selectWorkspace: async () => {
                await this.exclusively(() => this.selectWorkspace(profile, host!, "workspace"));
            },
            selectProfile: () => this.configureLogin("command"),
            // The network may be back when Retry is clicked: a VPN that wasn't up yet, say. Not retried by itself.
            retry: () => this.retry(),
        };
    }

    /**
     * The "Sign in again" remedy: `auth login --profile P`, then reconnect;
     * Unity Gateway too when it failed on the same session.
     */
    async signInAgain(profile: string, host: string): Promise<void> {
        await this.login(host, profile, { row: "workspace" });
        await this.reconnectBoth(profile);
    }

    /**
     * Connects the window again, and Unity Gateway when it failed on the same
     * profile: its own notice stayed quiet, so this one fixes both.
     */
    private async reconnectBoth(profile: string): Promise<void> {
        const { connection, unityGateway } = this.kernel;
        const ug = unityGateway.state.value;
        const [state] = await Promise.all([
            connection.reconnect(),
            ug.status === "error" && ug.profile === profile ? unityGateway.reconnect() : undefined,
        ]);
        if (state.status !== "connected") {
            throw this.connectError(profile, state);
        }
    }

    /**
     * Connects the window again, as it is now: a notice's Retry may be clicked
     * long after it showed, and Reconnect is picked from a menu built earlier.
     * When the window isn't failed any more, the menu opens, as the row's
     * actions do, rather than nothing happening.
     */
    private async retry(): Promise<void> {
        const s = this.kernel.connection.state.value;
        if (s.status === "error" && s.profile !== undefined) {
            await this.reconnectBoth(s.profile);
            return;
        }
        await this.showMenu();
    }

    /** The row's state may be stale by the time it's clicked, so this acts on the state now. */
    private async signInAgainFromRow(): Promise<void> {
        const s = this.kernel.connection.state.value;
        if (s.status === "error" && s.remedy === "signInAgain" && s.profile && s.host) {
            await this.signInAgain(s.profile, s.host);
        } else {
            await this.configureLogin("command");
        }
    }

    /** The row's state may be stale by the time it's clicked, so this acts on the state now. */
    private async selectWorkspaceFromRow(): Promise<void> {
        const s = this.kernel.connection.state.value;
        if (s.status === "error" && s.remedy === "selectWorkspace" && s.profile && s.host) {
            const { profile, host } = s;
            await this.exclusively(() => this.selectWorkspace(profile, host, "workspace"));
        } else {
            await this.configureLogin("command");
        }
    }

    /**
     * "Select a workspace" for a profile signed in to the account only: the
     * choice, then the CLI saves it (`auth login` with `?w=`, into the
     * profile or a new one), and the connection, or Unity Gateway's,
     * connects with the profile it leaves.
     */
    private async selectWorkspace(
        profile: string,
        host: string,
        forConnection: "workspace" | "unityGateway",
    ): Promise<true> {
        let source: WorkspaceSelectionSource = "typed";
        const record = (outcome: "connected" | "failed" | "cancelled") =>
            this.telemetry.record(WORKSPACE_SELECTION, { source, outcome });
        const { profiles } = this.kernel.connection;
        let name: string;
        try {
            const snapshot = await profiles.refresh("select a workspace");
            // Loads while the choice is open, which shows it busy; the choice takes it from there.
            const workspaces = this.kernel.connection.accountWorkspaces(profile);
            const accountId = snapshot.profiles.find((p) => p.name === profile)?.accountId;
            let choice: ExistingProfileChoice;
            try {
                choice = await chooseWorkspace(
                    {
                        host,
                        profile,
                        accountId,
                        profiles: snapshot.profiles,
                        workspaces,
                        check: (id) => this.kernel.connection.checkWorkspace(profile, id),
                        openExternal: (url) => void env.openExternal(Uri.parse(url)),
                    },
                    this.trackingFactory(),
                );
            } finally {
                this.openInput = undefined;
            }
            if (choice.kind === "profile") {
                source = "existingProfile";
                name = choice.profile;
            } else {
                if (choice.fromList) {
                    source = "list";
                }
                name = choice.newProfile ?? profile;
                await this.login(host, name, {
                    workspaceId: choice.workspaceId,
                    row: forConnection,
                });
            }
        } catch (e) {
            record(isCancellation(e) ? "cancelled" : "failed");
            throw e;
        }
        try {
            if (forConnection === "unityGateway") {
                await this.kernel.unityGateway.signIn(name);
            } else {
                const state = await window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: `Databricks: Logging in using Profile '${name}'`,
                    },
                    () =>
                        name === profile
                            ? this.kernel.connection.reconnect()
                            : this.kernel.connection.useProfile(name),
                );
                if (state.status !== "connected") {
                    throw this.connectError(name, state);
                }
            }
        } catch (e) {
            record(isCancellation(e) ? "cancelled" : "failed");
            throw e;
        }
        record("connected");
        return true;
    }

    /** Signs out of the project's target, or of windows without a project; remembered across restarts. */
    async logout(): Promise<void> {
        await this.kernel.connection.signOut();
    }

    /**
     * Opens the resolved config file, creating an empty one if needed (AUTH-04).
     * A new file is readable only by the user, as the CLI creates it: the CLI
     * keeps an existing file's mode when it writes a token into it.
     */
    async openConfigFile(): Promise<void> {
        const file = this.kernel.configFile();
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, "", { flag: "a", mode: 0o600 });
        const doc = await workspace.openTextDocument(Uri.file(file));
        await window.showTextDocument(doc);
    }

    async saveNewProfile(name: string): Promise<void> {
        const current = this.kernel.connection.connection;
        const info = this.kernel.connection.profiles.snapshot.latest?.profiles.find(
            (p) => p.name === current?.profile,
        );
        const token = info?.profile.token?.value;
        if (current === undefined || current.authType !== "pat" || token === undefined) {
            throw new Error("Must login first");
        }
        await configure(
            this.kernel.cli,
            { host: current.host, profile: name, token },
            { env: this.signedOutEnv("hostAndProxy") },
        );
        await this.kernel.connection.profiles.refresh("profile saved");
    }

    /** The status-bar menu. */
    async showMenu(): Promise<void> {
        if (this.kernel.capabilities.identity === "session") {
            return this.showSessionMenu();
        }
        const state = this.kernel.connection.state.value;
        type Item = QuickPickItem & { run: () => Promise<void> };
        const items: Item[] = [];
        // In a project the target decides the workspace: another target is the way to another one.
        const inProject = this.kernel.connection.project !== undefined;
        const selectTarget: Item = {
            label: "$(target) Select target",
            detail: "The target decides the workspace",
            run: async () => {
                await vscodeCommands.executeCommand(SELECT_TARGET);
            },
        };
        if (state.status === "connected") {
            if (inProject) {
                items.push({
                    label: "$(arrow-swap) Switch profile",
                    detail: `Profiles for ${state.connection.host}`,
                    run: () => this.configureLogin("statusBar", state.connection.host),
                });
                items.push(selectTarget);
            } else {
                // The wizard opens on the current workspace, so its profiles are one Enter away.
                items.push({
                    label: "$(arrow-swap) Switch workspace or profile",
                    run: () => this.configureLogin("statusBar"),
                });
            }
            items.push({ label: "$(sign-out) Sign out", run: () => this.logout() });
        } else {
            if (
                state.status === "error" &&
                state.profile !== undefined &&
                state.host !== undefined
            ) {
                const { profile, host } = state;
                // The menu offers the notice's fix, and Reconnect, as the row does.
                const fix = fixFor(state);
                const fixes = this.fixes(profile, host);
                if (fix?.kind === "signInAgain") {
                    items.push({
                        label: `$(refresh) ${fix.title}`,
                        detail: `Profile ${profile}`,
                        run: fixes.signInAgain,
                    });
                }
                if (fix?.kind === "selectWorkspace") {
                    items.push({
                        label: `$(list-selection) ${fix.title}`,
                        detail: `Profile ${profile} is signed in to the account, not a workspace`,
                        run: fixes.selectWorkspace,
                    });
                }
                if (fix?.kind === "selectProfile") {
                    items.push({
                        label: `$(list-selection) ${fix.title}`,
                        run: fixes.selectProfile,
                    });
                }
                // As Unity Gateway's menu: the failure is shown again if the reconnect fails.
                items.push({
                    label: "$(refresh) Reconnect",
                    detail: `Profile ${profile}`,
                    run: () => this.retry(),
                });
            }
            items.push({
                label: "$(sign-in) Sign in",
                run: () => this.configureLogin("statusBar"),
            });
            if (inProject) {
                items.push(selectTarget);
            }
            // As Unity Gateway's failed menu: the row's inline sign-out, too.
            if (state.status === "error") {
                items.push({ label: "$(sign-out) Sign out", run: () => this.logout() });
            }
        }
        items.push({
            label: "$(file) Open Databricks configuration file",
            run: () => this.openConfigFile(),
        });
        const pick = await window.showQuickPick(items, {
            title: "Databricks connection",
            placeHolder: describe(state),
        });
        if (pick === undefined) {
            throw new CancelledError();
        }
        await pick.run();
    }

    /**
     * A session window's menu: its identity is the session's, so it offers
     * nothing that changes it, and no profiles, only what to do with the
     * workspace it is connected to.
     */
    private async showSessionMenu(): Promise<void> {
        const { connection } = this.kernel;
        const state = connection.state.value;
        const host = hostOf(state);
        type Item = QuickPickItem & { run: () => Promise<void> };
        const items: Item[] = [
            {
                label: "$(refresh) Reconnect",
                detail: "With the SSH tunnel's credentials",
                run: async () => {
                    const next = await connection.reconnect();
                    if (next.status !== "connected") {
                        const remedy =
                            next.status === "error" && next.remedy === "restartSession"
                                ? ` ${RESTART_SESSION}`
                                : "";
                        throw new UserFacingError(
                            "SESSION_NOT_CONNECTED",
                            `Can't connect with the session's credentials: ${describe(next)}${remedy}`,
                        );
                    }
                },
            },
        ];
        if (host !== undefined) {
            items.push(
                {
                    label: "$(link-external) Open the workspace in a browser",
                    detail: host,
                    run: async () => void (await env.openExternal(Uri.parse(host))),
                },
                {
                    label: "$(copy) Copy the workspace's host",
                    run: async () => {
                        await env.clipboard.writeText(host);
                    },
                },
            );
        }
        const pick = await window.showQuickPick(items, {
            title: "Databricks connection (from the SSH tunnel)",
            placeHolder:
                state.status === "error" && state.remedy === "restartSession"
                    ? `${describe(state)} ${RESTART_SESSION}`
                    : `${describe(state)}. To use another workspace, open a local window.`,
        });
        if (pick === undefined) {
            throw new CancelledError();
        }
        await pick.run();
    }

    /**
     * Signed out: no profile yet. `configure` keeps the proxy overlay, which 2.22.0 had no call for.
     * `auth login` and the renewal's `auth token` ran with the host env, keeping the config file.
     */
    private signedOutEnv(environment: ChildEnvironment) {
        return this.kernel.childEnv({ connection: null, cli: true, environment });
    }
}

function hostOf(state: ConnectionState): string | undefined {
    switch (state.status) {
        case "connected":
            return state.connection.host;
        case "signedOut":
            return state.hint?.host;
        default:
            return state.host;
    }
}

function describe(state: ConnectionState): string {
    switch (state.status) {
        case "connected":
            return `Connected to ${state.connection.host} as ${state.connection.userName}`;
        case "connecting":
            return "Connecting…";
        case "signedOut":
            return `Not signed in. ${state.reason}`;
        case "error":
            return errorMessage(state.error);
    }
}
