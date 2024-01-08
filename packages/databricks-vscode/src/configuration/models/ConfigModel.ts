import {Disposable, EventEmitter, Uri, Event} from "vscode";
import {
    DATABRICKS_CONFIG_KEYS,
    DatabricksConfig,
    isBundleConfigKey,
    isOverrideableConfigKey,
    DatabricksConfigSourceMap,
} from "../types";
import {Mutex} from "../../locking";
import {CachedValue} from "../../locking/CachedValue";
import {StateStorage} from "../../vscode-objs/StateStorage";
import lodash from "lodash";
import {onError} from "../../utils/onErrorDecorator";
import {BundleFileConfigModel} from "./BundleFileConfigModel";
import {OverrideableConfigModel} from "./OverrideableConfigModel";

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
        const overrides = await this.overrideableConfigModel.load();
        const bundleConfigs = await this.bundleFileConfigModel.load();
        const newValue: DatabricksConfig = {
            ...bundleConfigs,
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
        keyof DatabricksConfig | "target",
        {
            emitter: EventEmitter<void>;
            onDidEmit: Event<void>;
        }
    >();
    public onDidChangeAny = this.configCache.onDidChange;

    private _target: string | undefined;

    constructor(
        private readonly overrideableConfigModel: OverrideableConfigModel,
        public readonly bundleFileConfigModel: BundleFileConfigModel,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this.overrideableConfigModel.onDidChange(async () => {
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
            this.bundleFileConfigModel.onDidChange(async () => {
                await this.readTarget();
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
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
            (await this.bundleFileConfigModel.targets) ?? {}
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
            savedTarget = await this.bundleFileConfigModel.defaultTarget;
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
            !(this.target in ((await this.bundleFileConfigModel.targets) ?? {}))
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
                this.bundleFileConfigModel.setTarget(target),
                this.overrideableConfigModel.setTarget(target),
            ]);
        });
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
        if (isBundleConfigKey(key) && handleInteractiveWrite) {
            await handleInteractiveWrite(
                await this.bundleFileConfigModel.getFileToWrite(key)
            );
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
