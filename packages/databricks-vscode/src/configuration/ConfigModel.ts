import {Disposable, EventEmitter, Uri} from "vscode";
import {
    BundleConfigs,
    DatabricksConfigs,
    isBundleConfig,
    isOverrideableConfig,
} from "./types";
import {ConfigOverrideReaderWriter} from "./ConfigOverrideReaderWriter";
import {BundleConfigReaderWriter} from "./BundleConfigReaderWriter";
import {Mutex} from "../locking";
import {BundleWatcher} from "../file-managers/BundleWatcher";
import {CachedValue} from "../locking/CachedValue";
import {StateStorage} from "../vscode-objs/StateStorage";

function isDirectToBundleConfig(
    key: keyof BundleConfigs,
    mode?: BundleConfigs["mode"]
) {
    const directToBundleConfigs: (keyof BundleConfigs)[] = [];
    if (mode !== undefined) {
        // filter by mode
    }
    return directToBundleConfigs.includes(key);
}

const defaults: DatabricksConfigs = {
    mode: "dev",
};
/**
 * In memory view of the databricks configs loaded from overrides and bundle.
 */
export class ConfigModel implements Disposable {
    private disposables: Disposable[] = [];

    private readonly configsMutex = new Mutex();
    private readonly configCache = new CachedValue<DatabricksConfigs>(
        async (oldValue) => {
            if (this.target === undefined) {
                return {};
            }
            const overrides = this.overrideReaderWriter.readAll(this.target);
            const bundleConfigs = await this.bundleConfigReaderWriter.readAll(
                this.target
            );
            const newValue = {...bundleConfigs, ...overrides};

            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                this.onDidChangeEmitter.fire();
            }

            return newValue;
        }
    );

    private readonly onDidChangeEmitter = new EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    private _target: string | undefined;

    constructor(
        public readonly overrideReaderWriter: ConfigOverrideReaderWriter,
        public readonly bundleConfigReaderWriter: BundleConfigReaderWriter,
        private readonly stateStorage: StateStorage,
        private readonly bundleWatcher: BundleWatcher
    ) {
        this.disposables.push(
            this.overrideReaderWriter.onDidChange(async () => {
                await this.configCache.invalidate();
                //try to access the value to trigger cache update and onDidChange event
                this.configCache.value;
            }),
            this.bundleWatcher.onDidChange(async () => {
                await this.readTarget();
                await this.configCache.invalidate();
                //try to access the value to trigger cache update and onDidChange event
                this.configCache.value;
            })
        );
    }

    public async readTarget() {
        const targets = Object.keys(
            (await this.bundleConfigReaderWriter.targets) ?? {}
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
            savedTarget = await this.bundleConfigReaderWriter.defaultTarget;
        });
        await this.setTarget(savedTarget);
    }

    public get target() {
        return this._target;
    }

    public async setTarget(target: string | undefined) {
        if (target === this._target) {
            return;
        }

        await this.configsMutex.synchronise(async () => {
            this._target = target;
            await this.stateStorage.set("databricks.bundle.target", target);
        });
        await this.configCache.invalidate();
        this.onDidChangeEmitter.fire();
    }

    public async get<T extends keyof DatabricksConfigs>(
        key: T
    ): Promise<DatabricksConfigs[T] | undefined> {
        return (await this.configCache.value)[key] ?? defaults[key];
    }

    @Mutex.synchronise("configsMutex")
    public async set<T extends keyof DatabricksConfigs>(
        key: T,
        value?: DatabricksConfigs[T],
        handleInteractiveWrite?: (file: Uri | undefined) => any
    ): Promise<boolean> {
        // We work with 1 set of configs throughout the function.
        // No changes to the cache can happen when the global mutex is held.
        // The assumption is that user doesn't change the target mode in the middle of
        // writing a new config.
        const {mode} = {...(await this.configCache.value)};

        if (this.target === undefined) {
            return false;
        }
        if (isOverrideableConfig(key)) {
            return this.overrideReaderWriter.write(key, this.target, value);
        } else if (isBundleConfig(key)) {
            const isInteractive = handleInteractiveWrite !== undefined;

            // write to bundle if not interactive and the config can be safely written to bundle
            if (!isInteractive && isDirectToBundleConfig(key, mode)) {
                return await this.bundleConfigReaderWriter.write(
                    key,
                    this.target,
                    value
                );
            }

            if (isInteractive) {
                const file = await this.bundleConfigReaderWriter.getFileToWrite(
                    key,
                    this.target
                );
                handleInteractiveWrite(file);
            }
        }
        return true;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
