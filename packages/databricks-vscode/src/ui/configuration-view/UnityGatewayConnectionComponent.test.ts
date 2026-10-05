import assert from "assert";
import {EventEmitter, TreeItemCollapsibleState} from "vscode";
import {instance, mock, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {ProfileAuthProvider} from "../../configuration/auth/AuthProvider";
import {DatabricksWorkspace} from "../../configuration/DatabricksWorkspace";
import {UnityGatewayConnectionManager} from "../../lm-chat/UnityGatewayConnectionManager";
import {stampCopyKind} from "./copyActions";
import {
    UNITY_GATEWAY_CONNECTION_ID,
    UnityGatewayConnectionComponent,
} from "./UnityGatewayConnectionComponent";
import type {ConfigurationTreeItem} from "./types";

describe(__filename, () => {
    let mockConnectionManager: UnityGatewayConnectionManager;
    let connectionChanged: EventEmitter<void>;
    let enabledChanged: EventEmitter<void>;
    let enabled: boolean;
    let component: UnityGatewayConnectionComponent;

    function connect(
        profile: string,
        host = `https://${profile}.cloud.databricks.com`
    ) {
        const authProvider = new ProfileAuthProvider(
            new URL(host),
            profile,
            instance(mock(CliWrapper))
        );
        const mockWorkspace = mock(DatabricksWorkspace);
        when(mockWorkspace.authProvider).thenReturn(authProvider);
        when(mockConnectionManager.state).thenReturn("CONNECTED");
        when(mockConnectionManager.hasSavedProfile).thenReturn(true);
        when(mockConnectionManager.databricksWorkspace).thenReturn(
            instance(mockWorkspace)
        );
    }

    function label(item: ConfigurationTreeItem) {
        return typeof item.label === "string" ? item.label : item.label?.label;
    }

    beforeEach(() => {
        connectionChanged = new EventEmitter<void>();
        enabledChanged = new EventEmitter<void>();
        enabled = true;
        mockConnectionManager = mock(UnityGatewayConnectionManager);
        when(mockConnectionManager.state).thenReturn("DISCONNECTED");
        when(mockConnectionManager.hasSavedProfile).thenReturn(false);
        when(mockConnectionManager.databricksWorkspace).thenReturn(undefined);
        when(mockConnectionManager.onDidChange).thenReturn(
            connectionChanged.event
        );
        component = new UnityGatewayConnectionComponent(
            instance(mockConnectionManager),
            () => enabled,
            enabledChanged.event
        );
    });

    afterEach(() => {
        component.dispose();
        connectionChanged.dispose();
        enabledChanged.dispose();
    });

    it("shows nothing when the experiment is off", async () => {
        enabled = false;
        connect("a");

        assert.deepStrictEqual(await component.getChildren(), []);
    });

    it("offers to sign in when not connected", async () => {
        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Sign in to Unity Gateway");
        assert.strictEqual(
            item.command?.command,
            "databricks.unityGateway.signIn"
        );
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.unityGateway.signedOut"
        );
    });

    it("says it isn't connected when a saved profile isn't connected", async () => {
        when(mockConnectionManager.hasSavedProfile).thenReturn(true);

        const [item] = await component.getChildren();

        assert.strictEqual(
            label(item),
            "Unity Gateway isn't connected. Click to sign in."
        );
        assert.strictEqual(
            item.command?.command,
            "databricks.unityGateway.signIn"
        );
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.unityGateway.disconnected"
        );
    });

    it("shows a spinner while connecting", async () => {
        when(mockConnectionManager.state).thenReturn("CONNECTING");

        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Connecting to Unity Gateway");
        assert.strictEqual(item.contextValue, undefined);
    });

    it("shows the workspace URL when connected", async () => {
        connect("a");

        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Gateway Connection");
        assert.strictEqual(item.description, "https://a.cloud.databricks.com/");
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.unityGateway.connected"
        );
        assert.strictEqual(
            item.collapsibleState,
            TreeItemCollapsibleState.Collapsed
        );
    });

    it("keeps a non-default port in the URL", async () => {
        connect("a", "https://a.cloud.databricks.com:8443");

        const [item] = await component.getChildren();

        assert.strictEqual(
            item.description,
            "https://a.cloud.databricks.com:8443/"
        );
    });

    it("lists the profile under the connected row", async () => {
        connect("a");
        const [item] = await component.getChildren();

        const children = await component.getChildren(item);

        assert.deepStrictEqual(
            children.map((child) => [child.label, child.description]),
            [["Profile", "a"]]
        );
    });

    it("has no children for other rows", async () => {
        connect("a");

        assert.deepStrictEqual(await component.getChildren({id: "OTHER"}), []);
        assert.deepStrictEqual(
            await component.getChildren({
                id: `${UNITY_GATEWAY_CONNECTION_ID}.profile`,
            }),
            []
        );
    });

    it("only offers Copy Host on the connected row, and Copy Profile on its profile", async () => {
        const stamped = async () => {
            const [item] = await component.getChildren();
            stampCopyKind(item);
            return item.contextValue;
        };

        assert.strictEqual(
            await stamped(),
            "databricks.configuration.unityGateway.signedOut"
        );
        when(mockConnectionManager.state).thenReturn("CONNECTING");
        assert.strictEqual(await stamped(), undefined);
        connect("a");
        assert.strictEqual(
            await stamped(),
            "databricks.configuration.unityGateway.connected.copy=host"
        );

        const [row] = await component.getChildren();
        const [profile] = await component.getChildren(row);
        stampCopyKind(profile);
        assert.strictEqual(
            profile.contextValue,
            "databricks.configuration.copy=profile"
        );
    });

    it("refreshes when the connection or the experiment changes", () => {
        let refreshes = 0;
        component.onDidChange(() => refreshes++);

        connectionChanged.fire();
        enabledChanged.fire();

        assert.strictEqual(refreshes, 2);
    });
});
