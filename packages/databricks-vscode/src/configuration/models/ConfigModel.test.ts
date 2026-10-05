import assert from "assert";
import {mock, instance, when, verify, anything, reset} from "ts-mockito";
import {EventEmitter} from "vscode";
import {ConfigModel} from "./ConfigModel";
import type {OverrideableConfigModel} from "./OverrideableConfigModel";
import type {BundleValidateModel} from "../../bundle/models/BundleValidateModel";
import type {BundlePreValidateModel} from "../../bundle/models/BundlePreValidateModel";
import type {BundleRemoteStateModel} from "../../bundle/models/BundleRemoteStateModel";
import type {CustomWhenContext} from "../../vscode-objs/CustomWhenContext";
import type {StateStorage} from "../../vscode-objs/StateStorage";
import type {AuthProvider} from "../auth/AuthProvider";

/**
 * These tests lock how setTarget treats auth. Normal mode: setTarget clears the
 * auth provider on every path, so the login flow re-applies it after the
 * target. Remote SSH mode: RemoteBundleManager pins the environment provider,
 * which setTarget keeps.
 */
describe("ConfigModel target/auth ordering", () => {
    let bundleValidateModel: BundleValidateModel;
    let overrideableConfigModel: OverrideableConfigModel;
    let bundlePreValidateModel: BundlePreValidateModel;
    let bundleRemoteStateModel: BundleRemoteStateModel;
    let whenContext: CustomWhenContext;
    let stateStorage: StateStorage;
    let authProvider: AuthProvider;
    let configModel: ConfigModel;

    beforeEach(() => {
        // Use the generic mock<T>() form: these models expose their change
        // events as bound instance properties (not prototype methods), which
        // the class-based mock(Class) form doesn't stub.
        bundleValidateModel = mock<BundleValidateModel>();
        overrideableConfigModel = mock<OverrideableConfigModel>();
        bundlePreValidateModel = mock<BundlePreValidateModel>();
        bundleRemoteStateModel = mock<BundleRemoteStateModel>();
        whenContext = mock<CustomWhenContext>();
        stateStorage = mock<StateStorage>();
        authProvider = mock<AuthProvider>();

        // Constructor wires up listeners on the child models' change events.
        // The listeners are never fired here, so the payload type is irrelevant.
        when(overrideableConfigModel.onDidChange).thenReturn(
            new EventEmitter<any>().event
        );
        when(bundlePreValidateModel.onDidChange).thenReturn(
            new EventEmitter<any>().event
        );
        when(bundleRemoteStateModel.onDidChange).thenReturn(
            new EventEmitter<any>().event
        );
        when(bundleValidateModel.onDidChangeKey(anything())).thenReturn(
            new EventEmitter<any>().event
        );

        // setTarget validates against the available targets and persists.
        when(bundlePreValidateModel.targets).thenResolve({dev: {}} as any);
        when(stateStorage.set(anything(), anything())).thenResolve();

        // Child model refreshes are the "expensive" calls; make them no-ops.
        when(bundleValidateModel.refresh()).thenResolve();
        when(overrideableConfigModel.refresh()).thenResolve();
        when(bundlePreValidateModel.refresh()).thenResolve();
        when(bundleRemoteStateModel.refresh()).thenResolve();

        configModel = new ConfigModel(
            instance(bundleValidateModel),
            instance(overrideableConfigModel),
            instance(bundlePreValidateModel),
            instance(bundleRemoteStateModel),
            instance(whenContext),
            instance(stateStorage)
        );
    });

    afterEach(() => {
        configModel.dispose();
        reset(bundleRemoteStateModel);
    });

    it("setTarget clears the auth provider (its finally always nulls it)", async () => {
        await configModel.setTarget("dev");

        assert.equal(configModel.authProvider, undefined);
        // The remote state model is told auth is undefined, so a refresh
        // triggered here is a cheap no-op (readState short-circuits).
        verify(bundleRemoteStateModel.setAuthProvider(undefined)).atLeast(1);
    });

    it("applying auth after setTarget makes it stick", async () => {
        await configModel.setTarget("dev");
        await configModel.setAuthProvider(instance(authProvider));

        assert.equal(configModel.authProvider, instance(authProvider));
        verify(
            bundleRemoteStateModel.setAuthProvider(instance(authProvider))
        ).atLeast(1);
    });

    it("applying auth before setTarget is wiped by setTarget", async () => {
        // The wrong order: auth set first, then target. setTarget's finally
        // clears the provider, so it must not survive.
        await configModel.setAuthProvider(instance(authProvider));
        await configModel.setTarget("dev");

        assert.equal(configModel.authProvider, undefined);
    });

    it("setAuthProvider refreshes the remote state model", async () => {
        await configModel.setTarget("dev");
        reset(bundleRemoteStateModel);
        when(bundleRemoteStateModel.refresh()).thenResolve();

        await configModel.setAuthProvider(instance(authProvider));

        verify(
            bundleRemoteStateModel.setAuthProvider(instance(authProvider))
        ).once();
        verify(bundleRemoteStateModel.refresh()).once();
    });

    it("setTarget keeps a pinned auth provider", async () => {
        when(authProvider.toJSON()).thenReturn({host: "https://a"});
        await configModel.pinAuthProvider(instance(authProvider));
        await configModel.setTarget("dev");

        assert.equal(configModel.authProvider, instance(authProvider));
        verify(bundleRemoteStateModel.setAuthProvider(undefined)).never();
    });

    it("pinning refreshes validate but leaves the remote state to BundleCommands", async () => {
        when(authProvider.toJSON()).thenReturn({host: "https://a"});
        await configModel.setTarget("dev");
        reset(bundleRemoteStateModel);
        reset(bundleValidateModel);
        when(bundleValidateModel.refresh()).thenResolve();

        await configModel.pinAuthProvider(instance(authProvider));

        verify(
            bundleValidateModel.setAuthProvider(instance(authProvider))
        ).calledBefore(bundleValidateModel.refresh());
        verify(bundleValidateModel.refresh()).once();
        verify(bundleRemoteStateModel.refresh()).never();
    });

    it("re-applies a pinned provider after the child models drop it on setTarget", async () => {
        when(authProvider.toJSON()).thenReturn({host: "https://a"});
        await configModel.pinAuthProvider(instance(authProvider));
        const calls: string[] = [];
        reset(bundleValidateModel);
        when(bundleValidateModel.setTarget(anything())).thenCall(() =>
            calls.push("setTarget")
        );
        when(bundleValidateModel.setAuthProvider(anything())).thenCall((p) =>
            calls.push(p === undefined ? "clearAuth" : "setAuth")
        );
        when(bundleValidateModel.refresh()).thenCall(async () => {
            calls.push("refresh");
        });

        await configModel.setTarget("dev");

        // The child's setTarget drops auth; the pinned provider comes back
        // before the authenticated refresh, and is never cleared.
        assert.deepEqual(calls, ["setTarget", "refresh", "setAuth", "refresh"]);
        verify(
            bundleRemoteStateModel.setAuthProvider(instance(authProvider))
        ).atLeast(1);
    });

    it("keeps the target when the pinned refresh fails", async () => {
        when(authProvider.toJSON()).thenReturn({host: "https://a"});
        await configModel.pinAuthProvider(instance(authProvider));
        // setTarget's own (unauthenticated) refresh succeeds; the authenticated
        // one after re-applying auth fails.
        when(bundleValidateModel.refresh())
            .thenResolve()
            .thenReject(new Error("validate failed"));

        await assert.rejects(configModel.setTarget("dev"), /validate failed/);

        assert.equal(configModel.target, "dev");
        verify(whenContext.isTargetSet(true)).once();
    });

    it("pinAuthProvider skips a provider with the same credentials", async () => {
        const sameCredentials = mock<AuthProvider>();
        when(authProvider.toJSON()).thenReturn({host: "https://a"});
        when(sameCredentials.toJSON()).thenReturn({host: "https://a"});
        await configModel.setTarget("dev");
        await configModel.pinAuthProvider(instance(authProvider));
        reset(bundleValidateModel);
        when(bundleValidateModel.refresh()).thenResolve();

        await configModel.pinAuthProvider(instance(sameCredentials));

        assert.equal(configModel.authProvider, instance(authProvider));
        verify(bundleValidateModel.refresh()).never();
    });
});
