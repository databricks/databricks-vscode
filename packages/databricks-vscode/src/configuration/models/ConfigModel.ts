import {Disposable, EventEmitter, Uri, Event} from "vscode";
import {Mutex} from "../../locking";
import {CachedValue} from "../../locking/CachedValue";
import {StateStorage} from "../../vscode-objs/StateStorage";
import {onError, onErrorLambda} from "../../utils/onErrorDecorator";
import {AuthProvider} from "../auth/AuthProvider";
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

const defaults: ConfigState = {
    mode: "development",
};

const SELECTED_BUNDLE_VALIDATE_CONFIG_KEYS = [
    "clusterId",
    "remoteRootPath",
] as const;

const SELECTED_BUNDLE_PRE_VALIDATE_CONFIG_KEYS = [
    "host",
    "mode",
    "authParams",
] as const;

type ConfigState = Pick<
    BundleValidateState,
    (typeof SELECTED_BUNDLE_VALIDATE_CONFIG_KEYS)[number]
> &
    Pick<
        BundlePreValidateState,
        (typeof SELECTED_BUNDLE_PRE_VALIDATE_CONFIG_KEYS)[number]
    > &
    OverrideableConfigState;

export type ConfigSource = "bundle" | "override" | "default";

type ConfigSourceMap = {
    [K in keyof ConfigState]: {
        config: ConfigState[K];
        source: ConfigSource;
    };
};

/**
 * In memory view of the databricks configs loaded from overrides and bundle.
 */
export class ConfigModel implements Disposable {
    private disposables: Disposable[] = [];

    private readonly configsMutex = new Mutex();
    /** Used to lock state updates until certain actions complete. Aquire this always
     * after configsMutex to avoid deadlocks.
     */
    private readonly readStateMutex = new Mutex();
    private readonly configCache = new CachedValue<ConfigSourceMap>(
        this.readState.bind(this)
    );

    @Mutex.synchronise("readStateMutex")
    async readState() {
        if (this.target === undefined) {
            return {config: {}, source: {}};
        }
        const bundleValidateConfig = await this.bundleValidateModel.load([
            ...SELECTED_BUNDLE_VALIDATE_CONFIG_KEYS,
        ]);
        const overrides = await this.overrideableConfigModel.load();
        const bundleConfigs = await this.bundlePreValidateModel.load([
            ...SELECTED_BUNDLE_PRE_VALIDATE_CONFIG_KEYS,
        ]);
        const newConfigs = {
            ...bundleConfigs,
            ...bundleValidateConfig,
            ...overrides,
        };

        const newValue: any = {};
        (Object.keys(newConfigs) as (keyof typeof newConfigs)[]).forEach(
            (key) => {
                newValue[key] = {
                    config: newConfigs[key],
                    source:
                        overrides !== undefined && key in overrides
                            ? "override"
                            : "bundle",
                };
            }
        );

        return newValue;
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

    private _target: string | undefined;
    private _authProvider: AuthProvider | undefined;

    constructor(
        public readonly bundleValidateModel: BundleValidateModel,
        public readonly overrideableConfigModel: OverrideableConfigModel,
        public readonly bundlePreValidateModel: BundlePreValidateModel,
        private readonly vscodeWhenContext: CustomWhenContext,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this.overrideableConfigModel.onDidChange(
                onErrorLambda({popup: true}, async () => {
                    //refresh cache to trigger onDidChange event
                    await this.configCache.refresh();
                })
            ),
            this.bundlePreValidateModel.onDidChange(
                onErrorLambda({popup: true}, async () => {
                    await this.readTarget();
                    //refresh cache to trigger onDidChange event
                    await this.configCache.refresh();
                })
            ),
            ...SELECTED_BUNDLE_VALIDATE_CONFIG_KEYS.map((key) =>
                this.bundleValidateModel.onDidChangeKey(key)(
                    onErrorLambda({popup: true}, async () => {
                        async () => {
                            //refresh cache to trigger onDidChange event
                            this.configCache.refresh();
                        };
                    })
                )
            )
        );
    }

    @onError({popup: {prefix: "Failed to initialize configs."}})
    public async init() {
        await this.readTarget();
    }

    /**
     * Try to read target from bundle config.
     * If not found, try to read from state storage.
     * If not found, try to read the default target from bundle.
     */
    private async readTarget() {
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
        await this.setTarget(savedTarget);
    }

    public get target() {
        return this._target;
    }

    /**
     * Set target in the state storage and invalidate the configs cache.
     */
    public async setTarget(target: string | undefined) {
        if (target === this._target) {
            return;
        }

        if (
            target !== undefined &&
            !(target in ((await this.bundlePreValidateModel.targets) ?? {}))
        ) {
            throw new Error(`Target '${target}' doesn't exist in the bundle`);
        }
        await this.configsMutex.synchronise(async () => {
            this._target = target;
            await this.stateStorage.set("databricks.bundle.target", target);
            // We want to wait for all the configs to be loaded before we emit any change events from the
            // configStateCache.
            await this.readStateMutex.synchronise(async () => {
                await Promise.all([
                    this.bundlePreValidateModel.setTarget(target),
                    this.bundleValidateModel.setTarget(target),
                    this.overrideableConfigModel.setTarget(target),
                ]);
            });
            this.onDidChangeTargetEmitter.fire();
        });

        this.vscodeWhenContext.isTargetSet(this._target !== undefined);
    }

    @onError({popup: {prefix: "Failed to set auth provider."}})
    @Mutex.synchronise("configsMutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        this._authProvider = authProvider;
        await this.readStateMutex.synchronise(async () => {
            await this.bundleValidateModel.setAuthProvider(authProvider);
        });
        this.onDidChangeAuthProviderEmitter.fire();
    }

    get authProvider(): AuthProvider | undefined {
        return this._authProvider;
    }

    @Mutex.synchronise("configsMutex")
    public async get<T extends keyof ConfigState>(
        key: T
    ): Promise<ConfigState[T] | undefined> {
        return (await this.configCache.value)[key]?.config ?? defaults[key];
    }

    /**
     * Return config value along with source of the config.
     * Refer to {@link DatabricksConfigSource} for possible values.
     */
    @Mutex.synchronise("configsMutex")
    public async getS<T extends keyof ConfigState>(
        key: T
    ): Promise<ConfigSourceMap[T] | undefined> {
        const config = (await this.configCache.value)[key];
        return config
            ? ({
                  config: config.config ?? defaults[key],
                  source: config.source ?? "default",
              } as ConfigSourceMap[T])
            : undefined;
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
