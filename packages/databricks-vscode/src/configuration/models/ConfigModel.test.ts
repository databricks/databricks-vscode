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
 * These tests lock the target/auth ordering invariant that
 * RemoteBundleInitializer (Databricks Remote SSH mode) depends on: setTarget
 * clears the auth provider on every path, so auth must always be re-applied
 * after the target - never before.
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
});
