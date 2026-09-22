import {CancellationToken, Disposable, EventEmitter} from "vscode";
import {logging, WorkspaceClient} from "@databricks/sdk-experimental";
import {CliWrapper} from "../cli/CliWrapper";
import {
    ConnectionManager,
    ConnectionState,
} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {LoginWizard} from "../configuration/LoginWizard";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {Loggers} from "../logger";
import {Mutex} from "../locking";
import {StateStorage} from "../vscode-objs/StateStorage";
import {LanguageModelChatConnection} from "./types";

type ProjectConnection = Pick<
    ConnectionManager,
    | "apiClient"
    | "databricksWorkspace"
    | "isInitialized"
    | "login"
    | "logout"
    | "onDidChangeState"
    | "state"
>;

type Login = () => Promise<AuthProvider | undefined>;
type RestoreAuth = (value: Record<string, string | undefined>) => AuthProvider;
type LoadWorkspace = (
    client: WorkspaceClient,
    authProvider: AuthProvider
) => Promise<DatabricksWorkspace>;

/**
 * Supplies the language-model provider with a workspace session independently
 * of a Databricks project. An initialized project connection wins when it is
 * connected; otherwise this manager restores or creates a standalone session.
 */
export class LanguageModelChatConnectionManager
    implements LanguageModelChatConnection, Disposable
{
    private readonly connectionMutex = new Mutex();
    private readonly onDidChangeStateEmitter =
        new EventEmitter<ConnectionState>();
    private projectConnection?: ProjectConnection;
    private projectConnectionListener?: Disposable;
    private standaloneState: ConnectionState = "DISCONNECTED";
    private standaloneWorkspaceClient?: WorkspaceClient;
    private standaloneDatabricksWorkspace?: DatabricksWorkspace;
    private restoreAttempted = false;

    readonly onDidChangeState = this.onDidChangeStateEmitter.event;

    constructor(
        private readonly cli: CliWrapper,
        private readonly stateStorage: StateStorage,
        private readonly login: Login = () => LoginWizard.run(cli),
        private readonly restoreAuth: RestoreAuth = (value) =>
            AuthProvider.fromJSON(value, cli),
        private readonly loadWorkspace: LoadWorkspace = DatabricksWorkspace.load
    ) {}

    get state(): ConnectionState {
        if (
            this.projectConnection?.state === "CONNECTED" ||
            this.standaloneState === "CONNECTED"
        ) {
            return "CONNECTED";
        }
        if (
            this.projectConnection?.state === "CONNECTING" ||
            this.standaloneState === "CONNECTING"
        ) {
            return "CONNECTING";
        }
        return "DISCONNECTED";
    }

    get apiClient(): LanguageModelChatConnection["apiClient"] {
        if (this.projectConnection?.state === "CONNECTED") {
            return this.projectConnection.apiClient;
        }
        return this.standaloneWorkspaceClient?.apiClient;
    }

    get databricksWorkspace(): {readonly id: string} | undefined {
        if (this.projectConnection?.state === "CONNECTED") {
            return this.projectConnection.databricksWorkspace;
        }
        return this.standaloneDatabricksWorkspace;
    }

    setProjectConnection(connection: ProjectConnection): void {
        this.projectConnectionListener?.dispose();
        this.projectConnection = connection;
        this.projectConnectionListener = connection.onDidChangeState(() =>
            this.onDidChangeStateEmitter.fire(this.state)
        );
        this.onDidChangeStateEmitter.fire(this.state);
    }

    async ensureConnected(
        interactive: boolean,
        token: CancellationToken
    ): Promise<void> {
        await this.connectionMutex.synchronise(async () => {
            if (this.apiClient !== undefined) {
                return;
            }
            if (this.projectConnection?.state === "CONNECTING") {
                return;
            }

            if (this.projectConnection?.isInitialized) {
                if (interactive) {
                    await this.projectConnection.login(true);
                }
                return;
            }

            if (!this.restoreAttempted) {
                this.restoreAttempted = true;
                await this.restoreStandaloneSession(token);
            }
            if (
                this.apiClient !== undefined ||
                !interactive ||
                token.isCancellationRequested
            ) {
                return;
            }

            const authProvider = await this.login();
            if (authProvider === undefined || token.isCancellationRequested) {
                return;
            }
            await this.connectStandalone(authProvider);
            await this.persistAuth(authProvider);
        });
    }

    async configure(): Promise<void> {
        await this.connectionMutex.synchronise(async () => {
            if (this.projectConnection?.isInitialized) {
                await this.projectConnection.login(true, true);
                return;
            }

            const authProvider = await this.login();
            if (authProvider === undefined) {
                return;
            }
            await this.connectStandalone(authProvider);
            await this.persistAuth(authProvider);
            this.restoreAttempted = true;
        });
    }

    async signOut(): Promise<void> {
        await this.connectionMutex.synchronise(async () => {
            this.standaloneWorkspaceClient = undefined;
            this.standaloneDatabricksWorkspace = undefined;
            this.restoreAttempted = false;
            this.updateStandaloneState("DISCONNECTED");
            await this.stateStorage.set("databricks.lmChat.auth", undefined);
            if (this.projectConnection?.state === "CONNECTED") {
                await this.projectConnection.logout();
            }
        });
    }

    private async restoreStandaloneSession(
        token: CancellationToken
    ): Promise<void> {
        const savedAuth = this.stateStorage.get("databricks.lmChat.auth");
        if (savedAuth === undefined || token.isCancellationRequested) {
            return;
        }
        try {
            await this.connectStandalone(this.restoreAuth(savedAuth));
        } catch (error) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "[LanguageModelChat] Failed to restore workspace authentication",
                error
            );
            await this.stateStorage.set("databricks.lmChat.auth", undefined);
        }
    }

    private async connectStandalone(authProvider: AuthProvider): Promise<void> {
        this.updateStandaloneState("CONNECTING");
        try {
            const client = await authProvider.getWorkspaceClient();
            const workspace = await this.loadWorkspace(client, authProvider);
            this.standaloneWorkspaceClient = client;
            this.standaloneDatabricksWorkspace = workspace;
            this.updateStandaloneState("CONNECTED");
        } catch (error) {
            this.standaloneWorkspaceClient = undefined;
            this.standaloneDatabricksWorkspace = undefined;
            this.updateStandaloneState("DISCONNECTED");
            throw error;
        }
    }

    private async persistAuth(authProvider: AuthProvider): Promise<void> {
        await this.stateStorage.set(
            "databricks.lmChat.auth",
            authProvider.authType === "pat" ? undefined : authProvider.toJSON()
        );
    }

    private updateStandaloneState(state: ConnectionState): void {
        this.standaloneState = state;
        this.onDidChangeStateEmitter.fire(this.state);
    }

    dispose(): void {
        this.projectConnectionListener?.dispose();
        this.onDidChangeStateEmitter.dispose();
    }
}
