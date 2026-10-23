import assert from "assert";
import {EventEmitter} from "vscode";
import {anything, instance, mock, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {ProfileAuthProvider} from "../../configuration/auth/AuthProvider";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../../configuration/DatabricksWorkspace";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {AuthTypeComponent} from "./AuthTypeComponent";
import {stampCopyKind} from "./copyActions";
import type {ConfigurationTreeItem} from "./types";

describe(__filename, () => {
    let enabledChanged: EventEmitter<void>;
    let enabled: boolean;
    let mockConnectionManager: ConnectionManager;
    let mockConfigModel: ConfigModel;
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
        const mockCli = mock(CliWrapper);
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
    });

    it("is named Bundle Connection when Unity Gateway Chat is on, and otherwise unchanged", async () => {
        enabled = true;

        const [item] = await component.getChildren();
        stampCopyKind(item);

        assert.strictEqual(label(item), "Bundle Connection");
        assert.strictEqual(item.description, "Profile 'a'");
        assert.strictEqual(item.collapsibleState, undefined);
        // Keeps the sign-in gear and Copy Auth Type.
        assert.strictEqual(
            item.contextValue,
            "databricks.configuration.authType.profile.copy=authType"
        );
        assert.deepStrictEqual(await component.getChildren(item), []);
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
