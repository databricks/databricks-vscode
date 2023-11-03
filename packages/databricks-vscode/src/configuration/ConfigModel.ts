import {Disposable, EventEmitter, Uri, Event} from "vscode";
import {
    BundleConfigs,
    DatabricksConfigs,
    isBundleConfig,
    isOverrideableConfig,
} from "./types";
import {ConfigOverrideReaderWriter} from "./ConfigOverrideReaderWriter";
import {BundleConfigReaderWriter} from "./BundleConfigReaderWriter";
import {Mutex} from "../locking";
import {BundleWatcher} from "../bundle/BundleWatcher";
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
            const overrides = await this.overrideReaderWriter.readAll(
                this.target
            );
            const bundleConfigs = await this.bundleConfigReaderWriter.readAll(
                this.target
            );
            const newValue: DatabricksConfigs = {
                ...bundleConfigs,
                ...overrides,
            };

            for (const key of <(keyof DatabricksConfigs)[]>(
                Object.keys(newValue)
            )) {
                if (
                    oldValue === null ||
                    JSON.stringify(oldValue[key]) !==
                        JSON.stringify(newValue[key])
                ) {
                    this.changeEmitters.get(key)?.emitter.fire();
                    this.onDidChangeAnyEmitter.fire();
                }
            }

            return newValue;
        }
    );

    private readonly changeEmitters = new Map<
        keyof DatabricksConfigs | "target",
        {
            emitter: EventEmitter<void>;
            onDidEmit: Event<void>;
        }
    >();
    private onDidChangeAnyEmitter = new EventEmitter<void>();
    public onDidChangeAny = this.onDidChangeAnyEmitter.event;

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

    public onDidChange<T extends keyof DatabricksConfigs | "target">(
        key: T,
        fn: () => any,
        thisArgs?: any
    ) {
        if (!this.changeEmitters.has(key)) {
            const emitter = new EventEmitter<void>();
            this.changeEmitters.set(key, {
                emitter: emitter,
                onDidEmit: emitter.event,
            });
        }

        const {onDidEmit} = this.changeEmitters.get(key)!;
        return onDidEmit(fn, thisArgs);
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
        this.changeEmitters.get("target")?.emitter.fire();
        this.onDidChangeAnyEmitter.fire();
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
    ): Promise<void> {
        // We work with 1 set of configs throughout the function.
        // No changes to the cache can happen when the global mutex is held.
        // The assumption is that user doesn't change the target mode in the middle of
        // writing a new config.
        const {mode} = {...(await this.configCache.value)};

        if (this.target === undefined) {
            throw new Error(
                `Can't set configuration '${key}' without selecting a target`
            );
        }
        if (isOverrideableConfig(key)) {
            return this.overrideReaderWriter.write(key, this.target, value);
        }
        if (isBundleConfig(key)) {
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
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
