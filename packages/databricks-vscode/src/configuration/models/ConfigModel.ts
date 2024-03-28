import {Disposable, EventEmitter, Uri, Event} from "vscode";
import {Mutex} from "../../locking";
import {CachedValue} from "../../locking/CachedValue";
import {StateStorage} from "../../vscode-objs/StateStorage";
import {onError} from "../../utils/onErrorDecorator";
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
import {
    BundleRemoteState,
    BundleRemoteStateModel,
} from "../../bundle/models/BundleRemoteStateModel";

const defaults: ConfigState = {
    mode: "development",
};

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

    private readonly configsMutex = new Mutex();
    /** Used to lock state updates until certain actions complete. Aquire this always
     * after configsMutex to avoid deadlocks.
     */
    private readonly readStateMutex = new Mutex();
    private readonly configCache = new CachedValue<ConfigState>(
        this.readState.bind(this)
    );

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

    private _target: string | undefined;
    private _authProvider: AuthProvider | undefined;

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
                await this.readTarget();
                //refresh cache to trigger onDidChange event
                await this.configCache.refresh();
            }),
            ...TOP_LEVEL_VALIDATE_CONFIG_KEYS.map((key) =>
                this.bundleValidateModel.onDidChangeKey(key)(async () => {
                    //refresh cache to trigger onDidChange event
                    await this.configCache.refresh();
                })
            ),
            this.bundleRemoteStateModel.onDidChange(async () => {
                await this.configCache.refresh();
            })
        );
    }

    @onError({popup: true})
    public async init() {
        await this.readTarget();
    }

    get targets() {
        return this.bundlePreValidateModel.targets;
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

        try {
            await this.setTarget(savedTarget);
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
                await this.stateStorage.set("databricks.bundle.target", target);
                // We want to wait for all the configs to be loaded before we emit any change events from the
                // configStateCache.
                this.bundlePreValidateModel.setTarget(target);
                this.bundleValidateModel.setTarget(target);
                this.overrideableConfigModel.setTarget(target);
                this.bundleRemoteStateModel.setTarget(target);
                this.onDidChangeTargetEmitter.fire();
                await Promise.all([
                    this.bundlePreValidateModel.refresh(),
                    this.bundleValidateModel.refresh(),
                    this.overrideableConfigModel.refresh(),
                    this.bundleRemoteStateModel.refresh(),
                ]);
            });
        } finally {
            this.configCache.set({});
            await this.setAuthProvider(undefined);
            this.vscodeWhenContext.isTargetSet(this._target !== undefined);
        }
    }

    @Mutex.synchronise("configsMutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        this._authProvider = authProvider;
        this.bundleRemoteStateModel.setAuthProvider(authProvider);
        this.bundleValidateModel.setAuthProvider(authProvider);
        this.onDidChangeAuthProviderEmitter.fire();
        await Promise.all([
            this.bundleRemoteStateModel.refresh(),
            this.bundleValidateModel.refresh(),
        ]);
    }

    get authProvider(): AuthProvider | undefined {
        return this._authProvider;
    }

    @Mutex.synchronise("configsMutex")
    public async get<T extends keyof ConfigState>(
        key: T
    ): Promise<ConfigState[T] | undefined> {
        return (await this.configCache.value)[key] ?? defaults[key];
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
