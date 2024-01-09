import {Disposable, EventEmitter, Uri, Event} from "vscode";
import {
    DATABRICKS_CONFIG_KEYS,
    DatabricksConfig,
    isBundlePreValidateConfigKey,
    isOverrideableConfigKey,
    DatabricksConfigSourceMap,
    BUNDLE_VALIDATE_CONFIG_KEYS,
} from "../types";
import {Mutex} from "../../locking";
import {CachedValue} from "../../locking/CachedValue";
import {StateStorage} from "../../vscode-objs/StateStorage";
import lodash from "lodash";
import {onError} from "../../utils/onErrorDecorator";
import {AuthProvider} from "../auth/AuthProvider";
import {OverrideableConfigModel} from "./OverrideableConfigModel";
import {BundlePreValidateModel} from "../../bundle/models/BundlePreValidateModel";
import {BundleValidateModel} from "../../bundle/models/BundleValidateModel";

const defaults: DatabricksConfig = {
    mode: "development",
};

/**
 * In memory view of the databricks configs loaded from overrides and bundle.
 */
export class ConfigModel implements Disposable {
    private disposables: Disposable[] = [];

    private readonly configsMutex = new Mutex();
    private readonly configCache = new CachedValue<{
        config: DatabricksConfig;
        source: DatabricksConfigSourceMap;
    }>(async () => {
        if (this.target === undefined) {
            return {config: {}, source: {}};
        }
        const bundleValidateConfig = await this.bundleValidateModel.load([
            ...BUNDLE_VALIDATE_CONFIG_KEYS,
        ]);
        const overrides = await this.overrideableConfigModel.load();
        const bundleConfigs = await this.bundlePreValidateModel.load();
        const newValue: DatabricksConfig = {
            ...bundleConfigs,
            ...bundleValidateConfig,
            ...overrides,
        };

        const source: DatabricksConfigSourceMap = {};

        /* By default undefined values are considered to have come from bundle. 
        This is because when override for a key is undefined, it means that the key
        is not overridden and we want to get the value from bundle. 
        */
        DATABRICKS_CONFIG_KEYS.forEach((key) => {
            source[key] =
                overrides !== undefined && key in overrides
                    ? "override"
                    : "bundle";
        });

        return {
            config: newValue,
            source: source,
        };
    });

    private readonly changeEmitters = new Map<
        keyof DatabricksConfig | "target" | "authProvider",
        {
            emitter: EventEmitter<void>;
            onDidEmit: Event<void>;
        }
    >();
    public onDidChangeAny = this.configCache.onDidChange;

    private _target: string | undefined;
    private _authProvider: AuthProvider | undefined;

    constructor(
        private readonly bundleValidateModel: BundleValidateModel,
        private readonly overrideableConfigModel: OverrideableConfigModel,
        public readonly bundlePreValidateModel: BundlePreValidateModel,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this.overrideableConfigModel.onDidChange(async () => {
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
            this.bundlePreValidateModel.onDidChange(async () => {
                await this.readTarget();
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
            ...BUNDLE_VALIDATE_CONFIG_KEYS.map((key) =>
                this.bundleValidateModel.onDidChangeKey(key)(async () => {
                    //refresh cache to trigger onDidChange event
                    this.configCache.refresh();
                })
            ),
            this.configCache.onDidChange(({oldValue, newValue}) => {
                DATABRICKS_CONFIG_KEYS.forEach((key) => {
                    if (
                        oldValue === null ||
                        !lodash.isEqual(
                            oldValue.config[key],
                            newValue.config[key]
                        )
                    ) {
                        this.changeEmitters.get(key)?.emitter.fire();
                    }
                });
            })
        );
    }

    @onError({popup: {prefix: "Failed to initialize configs."}})
    public async init() {
        await this.readTarget();
    }

    public onDidChange<T extends keyof DatabricksConfig | "target">(key: T) {
        if (!this.changeEmitters.has(key)) {
            const emitter = new EventEmitter<void>();
            this.changeEmitters.set(key, {
                emitter: emitter,
                onDidEmit: emitter.event,
            });
        }

        return this.changeEmitters.get(key)!.onDidEmit;
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
    @onError({popup: {prefix: "Failed to set target."}})
    public async setTarget(target: string | undefined) {
        if (target === this._target) {
            return;
        }

        if (
            this.target !== undefined &&
            !(
                this.target in
                ((await this.bundlePreValidateModel.targets) ?? {})
            )
        ) {
            throw new Error(
                `Target '${this.target}' doesn't exist in the bundle`
            );
        }
        await this.configsMutex.synchronise(async () => {
            this._target = target;
            await this.stateStorage.set("databricks.bundle.target", target);
            this.changeEmitters.get("target")?.emitter.fire();
            await Promise.all([
                this.bundlePreValidateModel.setTarget(target),
                this.bundleValidateModel.setTarget(target),
                this.overrideableConfigModel.setTarget(target),
            ]);
        });
    }

    @onError({popup: {prefix: "Failed to set auth provider."}})
    @Mutex.synchronise("configsMutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        await this.bundleValidateModel.setAuthProvider(authProvider);
        this._authProvider = authProvider;
        this.changeEmitters.get("authProvider")?.emitter.fire();
    }

    get authProvider(): AuthProvider | undefined {
        return this._authProvider;
    }

    @Mutex.synchronise("configsMutex")
    public async get<T extends keyof DatabricksConfig>(
        key: T
    ): Promise<DatabricksConfig[T] | undefined> {
        return (await this.configCache.value).config[key] ?? defaults[key];
    }

    /**
     * Return config value along with source of the config.
     * Refer to {@link DatabricksConfigSource} for possible values.
     */
    @Mutex.synchronise("configsMutex")
    public async getS<T extends keyof DatabricksConfig>(
        key: T
    ): Promise<
        | {
              config: DatabricksConfig[T];
              source: DatabricksConfigSourceMap[T];
          }
        | undefined
    > {
        const {config: fullConfig, source: fullSource} =
            await this.configCache.value;
        const config = fullConfig[key] ?? defaults[key];
        const source =
            fullConfig[key] !== undefined ? fullSource[key] : "default";
        return config
            ? {
                  config,
                  source,
              }
            : undefined;
    }

    @onError({popup: {prefix: "Failed to set config."}})
    @Mutex.synchronise("configsMutex")
    public async set<T extends keyof DatabricksConfig>(
        key: T,
        value?: DatabricksConfig[T],
        handleInteractiveWrite?: (file: Uri) => Promise<void>
    ) {
        if (this.target === undefined) {
            throw new Error(
                `Can't set configuration '${key}' without selecting a target`
            );
        }
        if (isOverrideableConfigKey(key)) {
            return this.overrideableConfigModel.write(key, this.target, value);
        }
        if (isBundlePreValidateConfigKey(key) && handleInteractiveWrite) {
            await handleInteractiveWrite(
                await this.bundlePreValidateModel.getFileToWrite(key)
            );
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
