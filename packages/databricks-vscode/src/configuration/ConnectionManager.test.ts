/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {Disposable} from "vscode";
import {anything, instance, mock, reset, verify, when} from "ts-mockito";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {ConnectionManager} from "./ConnectionManager";
import {ConfigModel} from "./models/ConfigModel";
import {CliWrapper} from "../cli/CliWrapper";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {Telemetry} from "../telemetry";
import {AuthProvider} from "./auth/AuthProvider";

describe(__filename, () => {
    let disposables: Array<Disposable>;

    let mockCli: CliWrapper;
    let mockConfigModel: ConfigModel;
    let mockWorkspaceFolderManager: WorkspaceFolderManager;
    let mockCustomWhenContext: CustomWhenContext;
    let mockAuthProvider: AuthProvider;
    let mockWorkspaceClient: WorkspaceClient;

    function buildConnectionManager(): ConnectionManager {
        return new ConnectionManager(
            instance(mockCli),
            instance(mockConfigModel),
            instance(mockWorkspaceFolderManager),
            instance(mockCustomWhenContext),
            new Telemetry()
        );
    }

    beforeEach(() => {
        disposables = [];
        mockCli = mock(CliWrapper);
        mockConfigModel = mock(ConfigModel);
        mockWorkspaceFolderManager = mock(WorkspaceFolderManager);
        mockCustomWhenContext = mock(CustomWhenContext);
        mockAuthProvider = mock<AuthProvider>();
        mockWorkspaceClient = mock(WorkspaceClient);

        // DatabricksWorkspace.load() reads the org id from a header on the
        // currentUser.me() response and (best-effort) the workspace conf.
        when(mockWorkspaceClient.currentUser).thenReturn({
            me: async () =>
                ({
                    "userName": "test@databricks.com",
                    "x-databricks-org-id": "1234",
                }) as any,
        } as any);
        when(mockWorkspaceClient.apiClient).thenReturn(undefined as any);
        when(mockAuthProvider.getWorkspaceClient()).thenResolve(
            instance(mockWorkspaceClient)
        );
        when(mockAuthProvider.host).thenReturn(
            new URL("https://test.databricks.com")
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
        reset(mockConfigModel);
    });

    it("connectFromEnvironment connects using the injected auth provider", async () => {
        const cm = buildConnectionManager();
        disposables.push(cm);

        await cm.connectFromEnvironment(instance(mockAuthProvider));

        assert.equal(cm.state, "CONNECTED");
        assert.ok(cm.workspaceClient);
        assert.ok(cm.databricksWorkspace);
        assert.equal(
            cm.databricksWorkspace?.host.toString(),
            "https://test.databricks.com/"
        );
        verify(mockCustomWhenContext.setLoggedIn(true)).atLeast(1);
    });

    it("connectFromEnvironment does not touch the config model (no bundle coupling)", async () => {
        const cm = buildConnectionManager();
        disposables.push(cm);

        await cm.connectFromEnvironment(instance(mockAuthProvider));

        verify(mockConfigModel.set(anything(), anything())).never();
        verify(mockConfigModel.setAuthProvider(anything())).never();
    });

    it("connectFromEnvironment disconnects and rethrows on failure", async () => {
        when(mockAuthProvider.getWorkspaceClient()).thenReject(
            new Error("no credentials")
        );
        const cm = buildConnectionManager();
        disposables.push(cm);

        await assert.rejects(
            () => cm.connectFromEnvironment(instance(mockAuthProvider)),
            /no credentials/
        );

        assert.equal(cm.state, "DISCONNECTED");
        assert.equal(cm.workspaceClient, undefined);
        assert.equal(cm.databricksWorkspace, undefined);
        verify(mockCustomWhenContext.setLoggedIn(false)).atLeast(1);
    });

    describe("connectFromEnvironment without an injected auth provider", () => {
        // These exercise the production credential path (new Config with an
        // EnvironmentLoader, PAT-only enforcement) which is skipped when a test
        // injects an AuthProvider. We only cover the fail-fast branches here:
        // the successful connect builds a real WorkspaceClient and calls
        // currentUser.me() against the host, which would hit the network - that
        // path is already covered by the injected-AuthProvider tests above. We
        // drive these purely through env vars and restore the environment
        // afterwards.
        let savedEnv: NodeJS.ProcessEnv;

        beforeEach(() => {
            savedEnv = process.env;
            process.env = {...savedEnv};
            // Clear anything a local ~/.databrickscfg-style env would set so the
            // EnvironmentLoader only sees what each test injects.
            delete process.env.DATABRICKS_HOST;
            delete process.env.DATABRICKS_TOKEN;
            delete process.env.DATABRICKS_CONFIG_PROFILE;
        });

        afterEach(() => {
            process.env = savedEnv;
        });

        it("fails fast when no host is present in the environment", async () => {
            process.env.DATABRICKS_TOKEN = "dapi1234567890";
            const cm = buildConnectionManager();
            disposables.push(cm);

            await assert.rejects(
                () => cm.connectFromEnvironment(),
                /No Databricks host found in the environment/
            );
            assert.equal(cm.state, "DISCONNECTED");
        });

        it("fails fast when a host but no token is present", async () => {
            process.env.DATABRICKS_HOST = "https://test.databricks.com";
            const cm = buildConnectionManager();
            disposables.push(cm);

            await assert.rejects(
                () => cm.connectFromEnvironment(),
                /No Databricks token found in the environment/
            );
            assert.equal(cm.state, "DISCONNECTED");
        });
    });
});
