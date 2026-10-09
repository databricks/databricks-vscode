import assert from "assert";
import {
    mock,
    instance,
    when,
    verify,
    anything,
    reset,
    capture,
} from "ts-mockito";
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
 * which setTarget keeps and only sends to a target on the session's own host.
 */

const HOST_A = "https://a.cloud.databricks.com";
const HOST_B = "https://b.cloud.databricks.com";

function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}
describe("ConfigModel target/auth ordering", () => {
    let bundleValidateModel: BundleValidateModel;
    let overrideableConfigModel: OverrideableConfigModel;
    let bundlePreValidateModel: BundlePreValidateModel;
    let bundleRemoteStateModel: BundleRemoteStateModel;
    let whenContext: CustomWhenContext;
    let stateStorage: StateStorage;
    let authProvider: AuthProvider;
    let validateChange: EventEmitter<any>;
    let bundleFilesChange: EventEmitter<void>;
    let configModel: ConfigModel;

    // The validate model's events and refresh, re-stubbed after a reset().
    function stubValidateModel() {
        when(bundleValidateModel.onDidChange).thenReturn(validateChange.event);
        when(bundleValidateModel.onDidChangeKey(anything())).thenReturn(
            new EventEmitter<any>().event
        );
        when(bundleValidateModel.refresh()).thenResolve();
    }

    function pin() {
        return configModel.pinAuthProvider(instance(authProvider));
    }

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
        validateChange = new EventEmitter<any>();
        bundleFilesChange = new EventEmitter<void>();
        when(authProvider.host).thenReturn(new URL(HOST_A));
        when(authProvider.toJSON()).thenReturn({host: HOST_A});
        when(bundlePreValidateModel.setSessionHost(anything())).thenResolve();
        when(bundlePreValidateModel.hasUnsupportedIncludeGlob()).thenResolve(
            false
        );

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
        when(bundlePreValidateModel.onDidChangeBundleFiles).thenReturn(
            bundleFilesChange.event
        );
        stubValidateModel();

        // setTarget validates against the available targets and persists.
        when(bundlePreValidateModel.targets).thenResolve({dev: {}} as any);
        when(stateStorage.set(anything(), anything())).thenResolve();

        // Child model refreshes are the "expensive" calls; make them no-ops.
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
        verify(
            bundleRemoteStateModel.setAuthProvider(undefined, anything())
        ).atLeast(1);
    });

    it("applying auth after setTarget makes it stick", async () => {
        await configModel.setTarget("dev");
        await configModel.setAuthProvider(instance(authProvider));

        assert.equal(configModel.authProvider, instance(authProvider));
        verify(
            bundleRemoteStateModel.setAuthProvider(
                instance(authProvider),
                anything()
            )
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
            bundleRemoteStateModel.setAuthProvider(
                instance(authProvider),
                anything()
            )
        ).once();
        verify(bundleRemoteStateModel.refresh()).once();
    });

    it("setTarget keeps a pinned auth provider", async () => {
        await pin();
        await configModel.setTarget("dev");

        assert.equal(configModel.authProvider, instance(authProvider));
        verify(
            bundleRemoteStateModel.setAuthProvider(undefined, anything())
        ).never();
    });

    it("pinning refreshes remote state itself when validate's output doesn't change", async () => {
        await configModel.setTarget("dev");
        reset(bundleRemoteStateModel);
        reset(bundleValidateModel);
        stubValidateModel();

        await pin();

        verify(bundleValidateModel.refresh()).once();
        verify(bundleRemoteStateModel.refresh()).once();
    });

    it("pinning leaves remote state to BundleCommands when validate's output changes", async () => {
        await configModel.setTarget("dev");
        reset(bundleRemoteStateModel);
        reset(bundleValidateModel);
        stubValidateModel();
        when(bundleValidateModel.refresh()).thenCall(async () => {
            validateChange.fire({});
        });

        await pin();

        verify(bundleRemoteStateModel.refresh()).never();
    });

    it("re-applies a pinned provider after the child models drop it on setTarget", async () => {
        await pin();
        const calls: string[] = [];
        reset(bundleValidateModel);
        stubValidateModel();
        when(bundleValidateModel.setTarget(anything())).thenCall(() =>
            calls.push("setTarget")
        );
        when(
            bundleValidateModel.setAuthProvider(anything(), anything())
        ).thenCall((p) =>
            calls.push(p === undefined ? "clearAuth" : "setAuth")
        );
        when(bundleValidateModel.refresh()).thenCall(async () => {
            calls.push("refresh");
            validateChange.fire({});
        });

        await configModel.setTarget("dev");

        // The child's setTarget drops auth; the pinned provider comes back
        // before the authenticated refresh, and is never cleared.
        assert.deepEqual(calls, ["setTarget", "refresh", "setAuth", "refresh"]);
    });

    it("a failing pinned refresh doesn't fail setTarget", async () => {
        await pin();
        // setTarget's own (unauthenticated) refresh succeeds; the authenticated
        // one after re-applying auth fails.
        when(bundleValidateModel.refresh())
            .thenResolve()
            .thenReject(new Error("validate failed"));

        await configModel.setTarget("dev");

        assert.equal(configModel.target, "dev");
        verify(whenContext.isTargetSet(true)).once();
    });

    it("sends pinned credentials only to the session host, or a host-less target", async () => {
        // The guard reads the workspace fresh from disk (bypassing the cache),
        // so stub that path rather than the cached `targets`.
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("dev")
        ).thenResolve({host: HOST_A});
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("other")
        ).thenResolve({host: HOST_B});
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("noHost")
        ).thenResolve({});
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("badHost")
        ).thenResolve({host: "has a space"});
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("profile")
        ).thenResolve({profile: "other-workspace"});
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("wholeVar")
        ).thenResolve("${var.ws}");
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("multiFile")
        ).thenResolve({host: HOST_A});
        // Not defined in the bundle we built: fail closed (the CLI may define it
        // from a file set we read differently).
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("absent")
        ).thenResolve(undefined);
        when(
            bundlePreValidateModel.getTargetWorkspaceFromDisk("globNeg")
        ).thenResolve({host: HOST_A});
        // The guard also reads how many files set the host/profile: single-file
        // for the normal targets, a two-file host conflict for `multiFile`.
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("dev")
        ).thenResolve({hostFiles: 1, profileFiles: 0});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("other")
        ).thenResolve({hostFiles: 1, profileFiles: 0});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("noHost")
        ).thenResolve({hostFiles: 0, profileFiles: 0});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("badHost")
        ).thenResolve({hostFiles: 1, profileFiles: 0});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("profile")
        ).thenResolve({hostFiles: 0, profileFiles: 1});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("multiFile")
        ).thenResolve({hostFiles: 2, profileFiles: 0});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("absent")
        ).thenResolve({hostFiles: 0, profileFiles: 0});
        when(
            bundlePreValidateModel.getWorkspaceAuthFileCounts("globNeg")
        ).thenResolve({hostFiles: 1, profileFiles: 0});
        // An include pattern uses a `[!…]` class the CLI reads differently, so
        // we can't trust which files loaded: fail closed, before resolving.
        when(bundlePreValidateModel.hasUnsupportedIncludeGlob()).thenResolve(
            true
        );
        await pin();

        const [, authGuard] = capture(
            bundleValidateModel.setAuthProvider
        ).last();

        // With an unsupported include glob, every target is refused.
        assert.strictEqual((await authGuard!("globNeg")).allowed, false);

        // The remaining cases depend on the per-target resolution, so drop the
        // glob backstop first.
        when(bundlePreValidateModel.hasUnsupportedIncludeGlob()).thenResolve(
            false
        );

        // Same host as the session: allowed. A different host: refused.
        assert.strictEqual((await authGuard!("dev")).allowed, true);
        assert.strictEqual((await authGuard!("other")).allowed, false);
        // No workspace.host: the CLI falls back to the session's own host, so
        // sending the credentials is safe.
        assert.strictEqual((await authGuard!("noHost")).allowed, true);
        // A host that's present but can't be parsed here: fail closed.
        assert.strictEqual((await authGuard!("badHost")).allowed, false);
        // A profile picks its own host (overriding DATABRICKS_HOST): fail
        // closed, since the session's credentials could reach another host.
        assert.strictEqual((await authGuard!("profile")).allowed, false);
        // The whole workspace block is an unresolved variable: fail closed.
        assert.strictEqual((await authGuard!("wholeVar")).allowed, false);
        // The host is contested across files: even though the merged host is
        // the session host, the CLI's last-file-wins merge decides it, so don't
        // bet the token on our file order matching the CLI's. Fail closed.
        assert.strictEqual((await authGuard!("multiFile")).allowed, false);
        // The target isn't in the bundle we built: fail closed.
        assert.strictEqual((await authGuard!("absent")).allowed, false);
    });

    it("pinAuthProvider skips a provider with the same credentials", async () => {
        const sameCredentials = mock<AuthProvider>();
        when(sameCredentials.toJSON()).thenReturn({host: HOST_A});
        await configModel.setTarget("dev");
        await pin();
        reset(bundleValidateModel);
        stubValidateModel();

        await configModel.pinAuthProvider(instance(sameCredentials));

        assert.equal(configModel.authProvider, instance(authProvider));
        verify(bundleValidateModel.refresh()).never();
    });
});

describe("ConfigModel target resolution", () => {
    // The serialising mutex, the "keep the saved target when it resolves to
    // none" persist rule, and resolving a target when a bundle file appears are
    // all gated on a pinned auth provider (Remote SSH mode). Normal mode keeps
    // its original behaviour, so tests pin only where they exercise the new one.
    let bundleValidateModel: BundleValidateModel;
    let overrideableConfigModel: OverrideableConfigModel;
    let bundlePreValidateModel: BundlePreValidateModel;
    let bundleRemoteStateModel: BundleRemoteStateModel;
    let stateStorage: StateStorage;
    let bundleFilesChange: EventEmitter<void>;
    let authProvider: AuthProvider;
    let configModel: ConfigModel;

    function pin() {
        return configModel.pinAuthProvider(instance(authProvider));
    }

    beforeEach(() => {
        bundleValidateModel = mock<BundleValidateModel>();
        overrideableConfigModel = mock<OverrideableConfigModel>();
        bundlePreValidateModel = mock<BundlePreValidateModel>();
        bundleRemoteStateModel = mock<BundleRemoteStateModel>();
        stateStorage = mock<StateStorage>();
        bundleFilesChange = new EventEmitter<void>();
        authProvider = mock<AuthProvider>();
        when(authProvider.host).thenReturn(new URL(HOST_A));
        when(authProvider.toJSON()).thenReturn({host: HOST_A});
        when(bundlePreValidateModel.setSessionHost(anything())).thenResolve();
        when(bundlePreValidateModel.hasUnsupportedIncludeGlob()).thenResolve(
            false
        );

        for (const event of [
            () => overrideableConfigModel.onDidChange,
            () => bundlePreValidateModel.onDidChange,
            () => bundleRemoteStateModel.onDidChange,
            () => bundleValidateModel.onDidChange,
        ]) {
            when(event()).thenReturn(new EventEmitter<any>().event);
        }
        when(bundleValidateModel.onDidChangeKey(anything())).thenReturn(
            new EventEmitter<any>().event
        );
        when(bundlePreValidateModel.onDidChangeBundleFiles).thenReturn(
            bundleFilesChange.event
        );
        for (const refresh of [
            () => bundleValidateModel.refresh(),
            () => overrideableConfigModel.refresh(),
            () => bundlePreValidateModel.refresh(),
            () => bundleRemoteStateModel.refresh(),
        ]) {
            when(refresh()).thenResolve();
        }

        when(bundlePreValidateModel.targets).thenResolve({dev: {}} as any);
        when(bundlePreValidateModel.defaultTarget).thenResolve("dev");
        when(stateStorage.get("databricks.bundle.target")).thenReturn(
            undefined
        );
        when(stateStorage.set(anything(), anything())).thenResolve();
    });

    // The serialising resolve, the "keep the saved target when it resolves to
    // none" persist rule, and resolving on a bundle-file change are gated on the
    // remote-mode flag, so each test builds the model in the mode it exercises.
    function build(remoteMode: boolean) {
        configModel = new ConfigModel(
            instance(bundleValidateModel),
            instance(overrideableConfigModel),
            instance(bundlePreValidateModel),
            instance(bundleRemoteStateModel),
            instance(mock<CustomWhenContext>()),
            instance(stateStorage),
            remoteMode
        );
        return configModel;
    }

    afterEach(() => {
        configModel?.dispose();
    });

    it("resolves the target once when resolutions overlap (remote mode)", async () => {
        build(true);
        await pin();

        await Promise.all([
            configModel.resolveTarget(),
            configModel.resolveTarget(),
        ]);

        assert.equal(configModel.target, "dev");
        verify(stateStorage.set("databricks.bundle.target", "dev")).once();
    });

    it("resolving to no target keeps the saved one (remote mode)", async () => {
        build(true);
        await pin();
        await configModel.setTarget("dev");
        // databricks.yml deleted: no targets left.
        when(bundlePreValidateModel.targets).thenResolve({} as any);
        when(bundlePreValidateModel.defaultTarget).thenResolve(undefined);
        when(stateStorage.get("databricks.bundle.target")).thenReturn("dev");

        await configModel.resolveTarget();

        assert.equal(configModel.target, undefined);
        verify(stateStorage.set("databricks.bundle.target", undefined)).never();
    });

    it("normal mode clears the saved target when it resolves to none", async () => {
        build(false);
        await configModel.setTarget("dev");
        when(bundlePreValidateModel.targets).thenResolve({} as any);
        when(bundlePreValidateModel.defaultTarget).thenResolve(undefined);
        when(stateStorage.get("databricks.bundle.target")).thenReturn("dev");

        await configModel.resolveTarget();

        assert.equal(configModel.target, undefined);
        verify(stateStorage.set("databricks.bundle.target", undefined)).once();
    });

    it("resolves a missing target when bundle files change (remote mode)", async () => {
        build(true);
        await pin();

        bundleFilesChange.fire();
        await flush();

        assert.equal(configModel.target, "dev");
    });

    it("normal mode ignores bundle-file changes with no target", async () => {
        build(false);
        bundleFilesChange.fire();
        await flush();

        assert.equal(configModel.target, undefined);
    });

    it("leaves a set target alone when bundle files change (remote mode)", async () => {
        build(true);
        await pin();
        await configModel.setTarget("dev");
        when(bundlePreValidateModel.targets).thenResolve({} as any);

        bundleFilesChange.fire();
        await flush();

        assert.equal(configModel.target, "dev");
    });

    it("reresolveTarget clears the target and resolves it again", async () => {
        build(false);
        await configModel.setTarget("dev");

        await configModel.reresolveTarget();

        verify(stateStorage.set("databricks.bundle.target", undefined)).once();
        assert.equal(configModel.target, "dev");
    });
});
