import {Disposable, Uri, EventEmitter} from "vscode";
import {BundleWatcher} from "../BundleWatcher";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {Mutex} from "../../locking";
import {CliWrapper} from "../../cli/CliWrapper";
import {BundleTarget} from "../types";
import {CachedValue} from "../../locking/CachedValue";
import {onError} from "../../utils/onErrorDecorator";
import lodash from "lodash";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {BundleValidateConfig} from "../../configuration/types";

type BundleValidateState = BundleValidateConfig & BundleTarget;

export class BundleValidateModel implements Disposable {
    private disposables: Disposable[] = [];
    private mutex = new Mutex();

    private target: string | undefined;
    private authProvider: AuthProvider | undefined;

    private readonly stateCache = new CachedValue<
        BundleValidateState | undefined
    >(this.readState.bind(this));

    private readonly onDidChangeKeyEmitters = new Map<
        keyof BundleValidateState,
        EventEmitter<void>
    >();

    onDidChangeKey(key: keyof BundleValidateState) {
        if (!this.onDidChangeKeyEmitters.has(key)) {
            this.onDidChangeKeyEmitters.set(key, new EventEmitter());
        }
        return this.onDidChangeKeyEmitters.get(key)!.event;
    }

    public onDidChange = this.stateCache.onDidChange;

    constructor(
        private readonly bundleWatcher: BundleWatcher,
        private readonly cli: CliWrapper,
        private readonly workspaceFolder: Uri
    ) {
        this.disposables.push(
            this.bundleWatcher.onDidChange(async () => {
                await this.stateCache.refresh();
            }),
            // Emit an event for each key that changes
            this.stateCache.onDidChange(async ({oldValue, newValue}) => {
                for (const key of Object.keys({
                    ...oldValue,
                    ...newValue,
                }) as (keyof BundleValidateState)[]) {
                    if (
                        oldValue === null ||
                        !lodash.isEqual(oldValue?.[key], newValue?.[key])
                    ) {
                        this.onDidChangeKeyEmitters.get(key)?.fire();
                    }
                }
            })
        );
    }

    private readerMapping: {
        [K in keyof BundleValidateState]: (
            t?: BundleTarget
        ) => BundleValidateState[K];
    } = {
        clusterId: (target) => target?.bundle?.compute_id,
        workspaceFsPath: (target) => target?.workspace?.file_path,
        resources: (target) => target?.resources,
    };

    @Mutex.synchronise("mutex")
    public async setTarget(target: string | undefined) {
        if (this.target === target) {
            return;
        }
        this.target = target;
        this.authProvider = undefined;
        await this.stateCache.refresh();
    }

    @Mutex.synchronise("mutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        if (
            !lodash.isEqual(this.authProvider?.toJSON(), authProvider?.toJSON())
        ) {
            this.authProvider = authProvider;
            await this.stateCache.refresh();
        }
    }

    @onError({popup: {prefix: "Failed to read bundle config."}})
    @Mutex.synchronise("mutex")
    private async readState() {
        if (this.target === undefined || this.authProvider === undefined) {
            return;
        }

        const targetObject = JSON.parse(
            await this.cli.bundleValidate(
                this.target,
                this.authProvider,
                this.workspaceFolder,
                workspaceConfigs.databrickscfgLocation
            )
        ) as BundleTarget;

        const configs: any = {};

        for (const key of Object.keys(
            this.readerMapping
        ) as (keyof BundleValidateState)[]) {
            configs[key] = this.readerMapping[key]?.(targetObject);
        }

        return {...configs, ...targetObject} as BundleValidateState;
    }

    @Mutex.synchronise("mutex")
    public async load<T extends keyof BundleValidateState>(
        keys: T[] = []
    ): Promise<Partial<Pick<BundleValidateState, T>> | undefined> {
        if (keys.length === 0) {
            return await this.stateCache.value;
        }

        const target = await this.stateCache.value;
        const configs: Partial<{
            [K in T]: BundleValidateState[K];
        }> = {};

        for (const key of keys) {
            configs[key] = this.readerMapping[key]?.(target);
        }

        return configs;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
