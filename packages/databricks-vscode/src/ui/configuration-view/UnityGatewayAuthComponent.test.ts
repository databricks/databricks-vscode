import assert from "assert";
import {EventEmitter, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {instance, mock} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../../configuration/auth/AuthProvider";
import {ConnectionState} from "../../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../../configuration/DatabricksWorkspace";
import {LanguageModelChatConnectionManager} from "../../lm-chat/LanguageModelChatConnectionManager";
import {resolveProviderResult} from "../../test/utils";
import {
    UnityGatewayAuthComponent,
    UNITY_GATEWAY_AUTH_ID,
} from "./UnityGatewayAuthComponent";

const HOST = new URL("https://chat.cloud.databricks.com");

function createConnection(
    state: ConnectionState,
    authProvider?: AuthProvider
): LanguageModelChatConnectionManager {
    const stateEmitter = new EventEmitter<ConnectionState>();
    return {
        state,
        databricksWorkspace:
            authProvider === undefined
                ? undefined
                : ({authProvider} as DatabricksWorkspace),
        onDidChangeState: stateEmitter.event,
    } as LanguageModelChatConnectionManager;
}

function profileAuth() {
    return new ProfileAuthProvider(HOST, "CHAT", instance(mock(CliWrapper)));
}

async function getDetails(authProvider: AuthProvider) {
    const component = new UnityGatewayAuthComponent(
        createConnection("CONNECTED", authProvider)
    );
    const [row] = (await resolveProviderResult(component.getChildren()))!;
    const children = await resolveProviderResult(component.getChildren(row));
    component.dispose();
    return children?.map(({label, description}) => ({label, description}));
}

async function getRoot(connection: LanguageModelChatConnectionManager) {
    const component = new UnityGatewayAuthComponent(connection);
    const items = await resolveProviderResult(component.getChildren());
    component.dispose();
    return items ?? [];
}

describe(__filename, () => {
    it("renders a sign-in action when disconnected", async () => {
        const [row] = await getRoot(createConnection("DISCONNECTED"));

        assert.strictEqual(row.id, UNITY_GATEWAY_AUTH_ID);
        assert.strictEqual(row.label, "Gateway Connection");
        assert.strictEqual(row.description, "Sign in");
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.unityGatewayAuth.disconnected"
        );
        assert.strictEqual(row.command?.command, "databricks.lmChat.configure");
    });

    it("renders the workspace host when connected", async () => {
        const [row] = await getRoot(
            createConnection("CONNECTED", profileAuth())
        );

        assert.strictEqual(row.description, "chat.cloud.databricks.com");
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.unityGatewayAuth.connected"
        );
        assert.strictEqual((row.iconPath as ThemeIcon).id, "account");
        assert.strictEqual(row.command, undefined);
        assert.strictEqual(
            row.collapsibleState,
            TreeItemCollapsibleState.Collapsed
        );
    });

    it("lists the profile under the connected row", async () => {
        assert.deepStrictEqual(await getDetails(profileAuth()), [
            {label: "Profile", description: "CHAT"},
        ]);
    });

    it("lists the auth type when the connection has no profile", async () => {
        const azureCli = {
            host: HOST,
            describe: () => "Azure CLI",
        } as unknown as AuthProvider;

        assert.deepStrictEqual(await getDetails(azureCli), [
            {label: "Auth Type", description: "Azure CLI"},
        ]);
    });

    it("renders a spinner while connecting", async () => {
        const [row] = await getRoot(createConnection("CONNECTING"));

        assert.strictEqual(row.description, "Connecting");
        assert.strictEqual((row.iconPath as ThemeIcon).id, "sync~spin");
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.unityGatewayAuth.connecting"
        );
    });

    it("returns nothing for a non-root parent", async () => {
        const component = new UnityGatewayAuthComponent(
            createConnection("DISCONNECTED")
        );
        const items = await resolveProviderResult(
            component.getChildren({label: "Other"})
        );

        assert.deepStrictEqual(items, []);
        component.dispose();
    });
});
