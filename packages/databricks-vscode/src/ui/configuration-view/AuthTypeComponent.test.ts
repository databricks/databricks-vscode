import assert from "assert";
import {EventEmitter, TreeItemCollapsibleState} from "vscode";
import {anything, instance, mock, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {ProfileAuthProvider} from "../../configuration/auth/AuthProvider";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../../configuration/DatabricksWorkspace";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {AUTH_TYPE_SWITCH_ID, AuthTypeComponent} from "./AuthTypeComponent";
import {stampCopyKind} from "./copyActions";
import type {ConfigurationTreeItem} from "./types";

describe(__filename, () => {
    let enabledChanged: EventEmitter<void>;
    let enabled: boolean;
    let mockConnectionManager: ConnectionManager;
    let mockConfigModel: ConfigModel;
    let mockCli: CliWrapper;
    let component: AuthTypeComponent;

    function label(item: ConfigurationTreeItem) {
        return typeof item.label === "string" ? item.label : item.label?.label;
    }

    beforeEach(() => {
        enabledChanged = new EventEmitter<void>();
        enabled = false;

        const mockWorkspace = mock(DatabricksWorkspace);
        when(mockWorkspace.authProvider).thenReturn(
            new ProfileAuthProvider(
                new URL("https://a.cloud.databricks.com"),
                "a",
                instance(mock(CliWrapper))
            )
        );
        mockConnectionManager = mock(ConnectionManager);
        when(mockConnectionManager.state).thenReturn("CONNECTED");
        when(mockConnectionManager.databricksWorkspace).thenReturn(
            instance(mockWorkspace)
        );
        when(mockConnectionManager.onDidChangeState).thenReturn(
            new EventEmitter<any>().event
        );
        mockConfigModel = mock(ConfigModel);
        when(mockConfigModel.target).thenReturn("dev");
        when(mockConfigModel.get("authProfile")).thenResolve("a");
        when(mockConfigModel.onDidChangeTarget).thenReturn(
            new EventEmitter<void>().event
        );
        mockCli = mock(CliWrapper);
        when(mockCli.listProfiles(anything())).thenResolve([]);

        component = new AuthTypeComponent(
            instance(mockConnectionManager),
            instance(mockConfigModel),
            instance(mockCli),
            () => enabled,
            enabledChanged.event
        );
    });

    afterEach(() => {
        component.dispose();
        enabledChanged.dispose();
    });

    it("shows the auth type when Unity Gateway Chat is off", async () => {
        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Auth Type");
        assert.strictEqual(item.description, "Profile 'a'");
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.authType.profile"
        );
        assert.strictEqual(item.collapsibleState, undefined);
        assert.deepStrictEqual(await component.getChildren(item), []);
    });

    it("matches the Gateway Connection row when Unity Gateway Chat is on", async () => {
        enabled = true;

        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Bundle Connection");
        assert.strictEqual(item.description, "https://a.cloud.databricks.com/");
        // Keeps the sign-in gear, which matches on this context value.
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.authType.profile"
        );
        assert.strictEqual(
            item.collapsibleState,
            TreeItemCollapsibleState.Collapsed
        );
    });

    it("lists the profile under the Bundle Connection row", async () => {
        enabled = true;
        const [item] = await component.getChildren();

        const children = await component.getChildren(item);

        assert.deepStrictEqual(
            children.map((child) => [child.label, child.description]),
            [["Profile", "a"]]
        );
        assert.deepStrictEqual(
            await component.getChildren({
                id: `${AUTH_TYPE_SWITCH_ID}.profile`,
            }),
            []
        );
    });

    it("offers Copy Host on the row and Copy Profile on its child", async () => {
        enabled = true;
        const [item] = await component.getChildren();
        const [child] = await component.getChildren(item);

        stampCopyKind(item);
        stampCopyKind(child);

        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.authType.profile.copy=host"
        );
        assert.strictEqual(
            child.contextValue,
            "databricks.configuration.copy=profile"
        );
    });

    it("keeps the bundle's login row when Unity Gateway Chat is on", async () => {
        enabled = true;
        when(mockConnectionManager.state).thenReturn("DISCONNECTED");
        when(mockConnectionManager.databricksWorkspace).thenReturn(undefined);
        when(mockConfigModel.get("host")).thenResolve(
            new URL("https://a.cloud.databricks.com")
        );

        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Login to Databricks");
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.authType.none"
        );
    });

    it("keeps the bundle's connecting row when Unity Gateway Chat is on", async () => {
        enabled = true;
        when(mockConnectionManager.state).thenReturn("CONNECTING");

        const [item] = await component.getChildren();

        assert.strictEqual(label(item), "Connecting to the workspace");
    });

    it("refreshes when Unity Gateway Chat is turned on or off", () => {
        let refreshes = 0;
        component.onDidChange(() => refreshes++);

        enabledChanged.fire();

        assert.strictEqual(refreshes, 1);
    });
});
