import {Disposable} from "vscode";
import {BundleFileSet, BundleWatcher} from "../../bundle";
import {BundleTarget} from "../../bundle/types";
import {CachedValue} from "../../locking/CachedValue";
import {BundleFileConfig, isBundleConfigKey} from "../types";
/**
 * Reads and writes bundle configs. This class does not notify when the configs change.
 * We use the BundleWatcher to notify when the configs change.
 */
export class BundleFileConfigLoader implements Disposable {
    private disposables: Disposable[] = [];

    private readonly bundleFileConfigCache = new CachedValue<
        BundleFileConfig | undefined
    >(async () => {
        if (this.target === undefined) {
            return undefined;
        }
        return this.readAll(this.target);
    });

    public readonly onDidChange = this.bundleFileConfigCache.onDidChange;

    private target: string | undefined;

    private readonly readerMapping: Record<
        keyof BundleFileConfig,
        (
            t?: BundleTarget
        ) => Promise<BundleFileConfig[keyof BundleFileConfig] | undefined>
    > = {
        authParams: this.getAuthParams,
        mode: this.getMode,
        host: this.getHost,
    };

    constructor(
        private readonly bundleFileSet: BundleFileSet,
        private readonly bunldeFileWatcher: BundleWatcher
    ) {
        this.disposables.push(
            this.bunldeFileWatcher.onDidChange(async () => {
                await this.bundleFileConfigCache.refresh();
            })
        );
    }

    private async getHost(target?: BundleTarget) {
        return target?.workspace?.host;
    }

    private async getMode(target?: BundleTarget) {
        return target?.mode;
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */
    private async getAuthParams(target?: BundleTarget) {
        return undefined;
    }
    /* eslint-enable @typescript-eslint/no-unused-vars */

    get targets() {
        return this.bundleFileSet.bundleDataCache.value.then(
            (data) => data?.targets
        );
    }

    get defaultTarget() {
        return this.targets.then((targets) => {
            if (targets === undefined) {
                return undefined;
            }
            const defaultTarget = Object.keys(targets).find(
                (target) => targets[target].default
            );
            return defaultTarget;
        });
    }

    public async setTarget(target: string | undefined) {
        this.target = target;
        await this.bundleFileConfigCache.refresh();
    }

    private async read<T extends keyof BundleFileConfig>(
        key: T,
        target: string
    ) {
        const targetObject = (await this.bundleFileSet.bundleDataCache.value)
            .targets?.[target];
        return (await this.readerMapping[key](targetObject)) as
            | BundleFileConfig[T]
            | undefined;
    }

    private async readAll(target: string) {
        const configs = {} as any;
        const targetObject = (await this.bundleFileSet.bundleDataCache.value)
            .targets?.[target];

        for (const key of Object.keys(this.readerMapping)) {
            if (!isBundleConfigKey(key)) {
                continue;
            }
            configs[key] = await this.readerMapping[key](targetObject);
        }
        return configs as BundleFileConfig;
    }

    public async load() {
        return await this.bundleFileConfigCache.value;
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
