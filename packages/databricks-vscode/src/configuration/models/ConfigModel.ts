import {Disposable, EventEmitter, Uri, Event} from "vscode";
import lodash from "lodash";
import {Mutex} from "../../locking";
import {CachedValue} from "../../locking/CachedValue";
import {StateStorage} from "../../vscode-objs/StateStorage";
import {onError, withOnErrorHandler} from "../../utils/onErrorDecorator";
import {AuthProvider, BundleAuthGuard} from "../auth/AuthProvider";
import {normalizeHost} from "../../utils/urlUtils";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {
    OverrideableConfigModel,
    OverrideableConfigState,
    isOverrideableConfigKey,
} from "./OverrideableConfigModel";
import {
    BundlePreValidateModel,
    BundlePreValidateState,
} from "../../bundle/models/BundlePreValidateModel";
import {
    BundleValidateModel,
    BundleValidateState,
} from "../../bundle/models/BundleValidateModel";
import {CustomWhenContext} from "../../vscode-objs/CustomWhenContext";
import {
    BundleRemoteState,
    BundleRemoteStateModel,
} from "../../bundle/models/BundleRemoteStateModel";

const defaults: ConfigState = {
    mode: "development",
};

/** The outcome of resolving a bundle target's `workspace.host`. */
export type TargetWorkspaceHost =
    | {kind: "session"}
    | {kind: "host"; host: URL}
    | {kind: "unresolved"};

const TOP_LEVEL_VALIDATE_CONFIG_KEYS = ["clusterId", "remoteRootPath"] as const;

const TOP_LEVEL_PRE_VALIDATE_CONFIG_KEYS = [
    "host",
    "mode",
    "authParams",
] as const;

type ConfigState = Pick<
    BundleValidateState,
    (typeof TOP_LEVEL_VALIDATE_CONFIG_KEYS)[number]
> &
    Pick<
        BundlePreValidateState,
        (typeof TOP_LEVEL_PRE_VALIDATE_CONFIG_KEYS)[number]
    > &
    OverrideableConfigState & {
        preValidateConfig?: BundlePreValidateState;
        validateConfig?: BundleValidateState;
        remoteStateConfig?: BundleRemoteState;
        overrides?: OverrideableConfigState;
    };

function selectTopLevelKeys(
    obj: any,
    keys: readonly string[]
): Record<string, any> {
    return keys.reduce((prev: any, key) => {
        prev[key] = obj[key];
        return prev;
    }, {});
}
/**
 * In memory view of the databricks configs loaded from overrides and bundle.
 */
export class ConfigModel implements Disposable {
    private disposables: Disposable[] = [];

    /**
     * Used to protect local configs (target, authProvider, configCache) from being updated
     * concurrently.
     */
    private readonly configsMutex = new Mutex();
    /** Used to lock state updates until certain actions complete. Aquire this always
     * after configsMutex to avoid deadlocks.
     */
    private readonly readStateMutex = new Mutex();
    private readonly configCache = new CachedValue<ConfigState>(
        this.readState.bind(this)
    );

    @onError({throw: false})
    @Mutex.synchronise("readStateMutex")
    async readState() {
        if (this.target === undefined) {
            return {};
        }
        const bundleValidateConfig = await this.bundleValidateModel.load();
        const overrides = await this.overrideableConfigModel.load();
        const bundlePreValidateConfig =
            await this.bundlePreValidateModel.load();

        return {
            ...selectTopLevelKeys(
                bundlePreValidateConfig,
                TOP_LEVEL_PRE_VALIDATE_CONFIG_KEYS
            ),
            ...selectTopLevelKeys(
                bundleValidateConfig,
                TOP_LEVEL_VALIDATE_CONFIG_KEYS
            ),
            ...overrides,
            preValidateConfig: bundlePreValidateConfig,
            validateConfig: bundleValidateConfig,
            overrides,
            remoteStateConfig: await this.bundleRemoteStateModel.load(),
        };
    }

    public onDidChange = this.configCache.onDidChange.bind(this.configCache);
    public onDidChangeKey = this.configCache.onDidChangeKey.bind(
        this.configCache
    );

    private onDidChangeTargetEmitter = new EventEmitter<void>();
    public readonly onDidChangeTarget: Event<void> =
        this.onDidChangeTargetEmitter.event;
    private onDidChangeAuthProviderEmitter = new EventEmitter<void>();
    public readonly onDidChangeAuthProvider: Event<void> =
        this.onDidChangeAuthProviderEmitter.event;

    /** Serialises target resolution so overlapping ones can't set it twice. */
    private readonly resolveTargetMutex = new Mutex();

    private _target: string | undefined;
    private _authProvider: AuthProvider | undefined;
    private pinned:
        | {authProvider: AuthProvider; authGuard: BundleAuthGuard}
        | undefined;

    constructor(
        private readonly bundleValidateModel: BundleValidateModel,
        private readonly overrideableConfigModel: OverrideableConfigModel,
        private readonly bundlePreValidateModel: BundlePreValidateModel,
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly vscodeWhenContext: CustomWhenContext,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this.overrideableConfigModel.onDidChange(async () => {
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
            this.bundlePreValidateModel.onDidChange(async () => {
                await this.resolveTarget();
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
            // Remote mode only (gated on `pinned`): with no target the
            // pre-validate state stays empty, so nothing else notices a bundle
            // file appearing or gaining targets. Normal mode's
            // BundleProjectManager owns this, so leave its behaviour unchanged.
            this.bundlePreValidateModel.onDidChangeBundleFiles(
                withOnErrorHandler(
                    async () => {
                        if (
                            this.pinned !== undefined &&
                            this.target === undefined
                        ) {
                            await this.resolveTarget();
                        }
                    },
                    {log: true, throw: false}
                )
            ),
            ...TOP_LEVEL_VALIDATE_CONFIG_KEYS.map((key) =>
                this.bundleValidateModel.onDidChangeKey(key)(async () => {
                    //refresh cache to trigger onDidChange event
                    await this.configCache.refresh();
                })
            ),
            this.bundleRemoteStateModel.onDidChange(async () => {
                await this.configCache.refresh();
            }),
            this.onDidChangeKey("mode")(async () => {
                // readState's @onError resolves the cached value to undefined
                // when a child model throws (same case the `get` guard handles).
                this.vscodeWhenContext.isDevTarget(
                    (await this.configCache.value)?.mode === "development"
                );
            })
        );
    }

    @onError({popup: true})
    public async init() {
        await this.resolveTarget();
    }

    get targets() {
        return this.bundlePreValidateModel.targets;
    }
    /**
     * Keep the current target if the bundle still defines it; otherwise use the
     * saved target, else the bundle's default.
     */
    public async resolveTarget() {
        // Normal mode keeps its original un-serialised behaviour. Remote mode
        // resolves from several triggers (startup, folder change, bundle-file
        // change) that can overlap, so it serialises them.
        if (this.pinned === undefined) {
            await this.resolveTargetLocked();
            return;
        }
        await this.resolveTargetMutex.synchronise(() =>
            this.resolveTargetLocked()
        );
    }

    /** Clear the target and resolve it again, e.g. for a new project folder. */
    public async reresolveTarget() {
        await this.resolveTargetMutex.synchronise(async () => {
            await this.setTarget(undefined);
            await this.resolveTargetLocked();
        });
    }

    private async resolveTargetLocked() {
        const targets = Object.keys(
            (await this.bundlePreValidateModel.targets) ?? {}
        );
        if (targets.includes(this.target ?? "")) {
            return;
        }

        let savedTarget: string | undefined;
        await this.configsMutex.synchronise(async () => {
            savedTarget = this.stateStorage.get("databricks.bundle.target");

            if (savedTarget !== undefined && targets.includes(savedTarget)) {
                return;
            }
            savedTarget = await this.bundlePreValidateModel.defaultTarget;
        });

        try {
            // Remote mode only: resolving to no target doesn't overwrite the
            // saved one, so a bundle file that briefly disappears (e.g. during a
            // git checkout) gets its target back. Normal mode persists as
            // before, so clearing the target still clears the saved value.
            const persist =
                this.pinned === undefined || savedTarget !== undefined;
            await this.commitTarget(savedTarget, persist);
        } catch (e: any) {
            let message: string = String(e);
            if (e instanceof Error) {
                message = e.message;
            }
            throw new Error(
                `Failed to initialize target ${savedTarget}: ${message}`
            );
        }
    }

    public get target() {
        return this._target;
    }

    /**
     * Set target in the state storage and invalidate the configs cache.
     */
    public async setTarget(target: string | undefined) {
        await this.commitTarget(target, true);
    }

    private async commitTarget(target: string | undefined, persist: boolean) {
        if (target === this._target) {
            return;
        }

        if (
            target !== undefined &&
            !(target in ((await this.bundlePreValidateModel.targets) ?? {}))
        ) {
            throw new Error(`Target '${target}' doesn't exist in the bundle`);
        }

        try {
            await this.configsMutex.synchronise(async () => {
                this._target = target;
                if (persist) {
                    await this.stateStorage.set(
                        "databricks.bundle.target",
                        target
                    );
                }
                // We want to wait for all the configs to be loaded before we emit any change events from the
                // configStateCache.
                this.bundlePreValidateModel.setTarget(target);
                this.bundleValidateModel.setTarget(target);
                this.overrideableConfigModel.setTarget(target);
                this.bundleRemoteStateModel.setTarget(target);
                await Promise.all([
                    this.bundlePreValidateModel.refresh(),
                    this.bundleValidateModel.refresh(),
                    this.overrideableConfigModel.refresh(),
                    this.bundleRemoteStateModel.refresh(),
                ]);
            });
        } catch (e) {
            this.configCache.set({}); // clear the cache
            throw e;
        } finally {
            this.onDidChangeTargetEmitter.fire();
            this.vscodeWhenContext.isTargetSet(this._target !== undefined);
            if (this.pinned === undefined) {
                await this.setAuthProvider(undefined);
            } else {
                // The child models drop auth on a target change. Re-applying it
                // here, outside the try, means a failing authenticated refresh
                // doesn't wipe the config cache.
                await this.reapplyPinnedAuthProvider();
            }
        }
    }

    /**
     * Pin an auth provider that doesn't depend on the target, such as the
     * environment credentials in Remote SSH mode. setTarget keeps it instead of
     * clearing it. Bundle commands only send its credentials to a target on the
     * session's own host (or one with no host of its own, where the CLI falls
     * back to the session host); a target on any other host is refused, since
     * the session's credentials only authenticate against the session's host.
     * Re-pinning the same credentials is a no-op, so a reconnect doesn't re-run
     * the bundle CLI.
     */
    public async pinAuthProvider(authProvider: AuthProvider) {
        if (
            lodash.isEqual(
                this.pinned?.authProvider.toJSON(),
                authProvider.toJSON()
            )
        ) {
            return;
        }
        this.pinned = {
            authProvider,
            authGuard: async (target) => {
                const resolution = await this.getTargetWorkspaceHost(target);
                switch (resolution.kind) {
                    case "session":
                        return true;
                    case "host":
                        return (
                            resolution.host.hostname ===
                            authProvider.host.hostname
                        );
                    case "unresolved":
                        // Fail closed: we can't tell where the CLI would send
                        // the credentials, so don't send them.
                        return false;
                }
            },
        };
        await this.reapplyPinnedAuthProvider();
    }

    /**
     * Hand the pinned provider to the child models and refresh the
     * authenticated state, e.g. after the user allows another host. Never
     * throws: a failing CLI run is logged.
     */
    public async reapplyPinnedAuthProvider() {
        const pinned = this.pinned;
        if (pinned === undefined) {
            return;
        }
        await this.configsMutex.synchronise(async () =>
            this.assignAuthProvider(pinned.authProvider, pinned.authGuard)
        );
        // Outside configsMutex so `get` callers don't wait on the CLI.
        await this.refreshAuthenticatedState();
    }

    /**
     * Refresh validate, and the remote state only when validate's output
     * didn't change: BundleCommands pulls the remote state on a validate
     * change, so refreshing it here too would run `bundle summary` twice.
     */
    private async refreshAuthenticatedState() {
        const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
        let validateChanged = false;
        const listener = this.bundleValidateModel.onDidChange(async () => {
            validateChanged = true;
        });
        try {
            await this.bundleValidateModel.refresh();
        } catch (e) {
            logger.error("Failed to refresh the bundle validate state", e);
        } finally {
            listener.dispose();
        }
        if (!validateChanged) {
            try {
                await this.bundleRemoteStateModel.refresh();
            } catch (e) {
                logger.error("Failed to refresh the bundle remote state", e);
            }
        }
    }

    /**
     * How the CLI would resolve this target's workspace host, read fresh from
     * the YAML on disk (bypassing the config cache, so a missed file-watcher
     * event can't leave a stale host approved). The credential guard and the
     * host-mismatch UI both read it here so they always agree on the target's
     * host.
     *  - `session`: no `workspace.host` and no `workspace.profile`, so the CLI
     *    falls back to `DATABRICKS_HOST` — the session's own host in Remote SSH
     *    mode.
     *  - `host`: an explicit, parseable host.
     *  - `unresolved`: a host we can't vouch for, so callers fail closed. Either
     *    a `workspace.profile` (the profile picks its own host, overriding
     *    `DATABRICKS_HOST`, and the CLI doesn't report the resolved host so we
     *    can't compare it); a host that's present but can't be parsed here (e.g.
     *    a `${...}` variable the CLI resolves but we don't); a whole
     *    `workspace` block supplied as a `${...}` variable; or a `host`/
     *    `profile` set in more than one file, where the CLI's last-file-wins
     *    merge decides the host and we won't trust our file order to match it.
     */
    public async getTargetWorkspaceHost(
        target: string
    ): Promise<TargetWorkspaceHost> {
        let workspace: {host?: string; profile?: string} | string | undefined;
        try {
            workspace =
                await this.bundlePreValidateModel.getTargetWorkspaceFromDisk(
                    target
                );
        } catch {
            return {kind: "unresolved"};
        }
        // The whole `workspace` block resolved to an unresolved `${...}`
        // variable: we can't tell where it points, so fail closed.
        if (typeof workspace === "string") {
            return {kind: "unresolved"};
        }
        // Backstop: if the host or profile is contested across files, the CLI's
        // last-file-wins merge picks the host and we won't bet the session
        // token on our file order matching the CLI's. Fail closed.
        try {
            const {hostFiles, profileFiles} =
                await this.bundlePreValidateModel.getWorkspaceAuthFileCounts(
                    target
                );
            if (hostFiles > 1 || profileFiles > 1) {
                return {kind: "unresolved"};
            }
        } catch {
            return {kind: "unresolved"};
        }
        // A profile authenticates against its own host (overriding
        // DATABRICKS_HOST), so the session's credentials could reach another
        // workspace. Remote mode only authenticates against the ambient
        // session, so refuse rather than guess the profile's host.
        if (
            typeof workspace?.profile === "string" &&
            workspace.profile.trim() !== ""
        ) {
            return {kind: "unresolved"};
        }
        const host = workspace?.host;
        if (host === undefined || host.trim() === "") {
            return {kind: "session"};
        }
        try {
            return {kind: "host", host: normalizeHost(host)};
        } catch {
            return {kind: "unresolved"};
        }
    }

    @Mutex.synchronise("configsMutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        this.assignAuthProvider(authProvider);
        await Promise.all([
            this.bundleRemoteStateModel.refresh(),
            this.bundleValidateModel.refresh(),
        ]);
    }

    private assignAuthProvider(
        authProvider: AuthProvider | undefined,
        authGuard?: BundleAuthGuard
    ) {
        this._authProvider = authProvider;
        this.bundleRemoteStateModel.setAuthProvider(authProvider, authGuard);
        this.bundleValidateModel.setAuthProvider(authProvider, authGuard);
        this.onDidChangeAuthProviderEmitter.fire();
    }

    get authProvider(): AuthProvider | undefined {
        return this._authProvider;
    }

    @Mutex.synchronise("configsMutex")
    public async get<T extends keyof ConfigState>(
        key: T
    ): Promise<ConfigState[T] | undefined> {
        // readState's @onError resolves to undefined when a child model throws.
        return (await this.configCache.value)?.[key] ?? defaults[key];
    }

    @Mutex.synchronise("configsMutex")
    public async set<T extends keyof ConfigState>(
        key: T,
        value?: ConfigState[T],
        handleInteractiveWrite?: (file: Uri) => Promise<void>
    ) {
        if (this.target === undefined) {
            throw new Error(
                `Can't set configuration '${key}' without selecting a target`
            );
        }
        if (isOverrideableConfigKey(key)) {
            return this.overrideableConfigModel.write(
                key,
                this.target,
                value as any
            );
        }
        if (handleInteractiveWrite) {
            await handleInteractiveWrite(
                await this.bundlePreValidateModel.getFileToWrite(key)
            );
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
