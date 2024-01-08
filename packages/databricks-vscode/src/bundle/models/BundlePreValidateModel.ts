import {Disposable, Uri} from "vscode";
import {BundleFileSet, BundleWatcher} from "..";
import {BundleTarget} from "../types";
import {CachedValue} from "../../locking/CachedValue";
import {
    BundlePreValidateConfig,
    isBundlePreValidateConfigKey,
} from "../../configuration/types";
/**
 * Reads and writes bundle configs. This class does not notify when the configs change.
 * We use the BundleWatcher to notify when the configs change.
 */
export class BundlePreValidateModel implements Disposable {
    private disposables: Disposable[] = [];

    private readonly stateCache = new CachedValue<
        BundlePreValidateConfig | undefined
    >(async () => {
        if (this.target === undefined) {
            return undefined;
        }
        return this.readState(this.target);
    });

    public readonly onDidChange = this.stateCache.onDidChange;

    private target: string | undefined;

    private readonly readerMapping: Record<
        keyof BundlePreValidateConfig,
        (
            t?: BundleTarget
        ) => Promise<
            BundlePreValidateConfig[keyof BundlePreValidateConfig] | undefined
        >
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
                await this.stateCache.refresh();
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
        await this.stateCache.refresh();
    }

    private async readState(target: string) {
        const configs = {} as any;
        const targetObject = (await this.bundleFileSet.bundleDataCache.value)
            .targets?.[target];

        for (const key of Object.keys(this.readerMapping)) {
            if (!isBundlePreValidateConfigKey(key)) {
                continue;
            }
            configs[key] = await this.readerMapping[key](targetObject);
        }
        return configs as BundlePreValidateConfig;
    }

    public async getFileToWrite<T extends keyof BundlePreValidateConfig>(
        key: T
    ) {
        const filesWithTarget: Uri[] = [];
        const filesWithConfig = (
            await this.bundleFileSet.findFile(async (data, file) => {
                const bundleTarget = data.targets?.[this.target ?? ""];
                if (bundleTarget) {
                    filesWithTarget.push(file);
                }
                if (
                    (await this.readerMapping[key](bundleTarget)) === undefined
                ) {
                    return false;
                }
                return true;
            })
        ).map((file) => file.file);

        if (filesWithConfig.length > 1) {
            throw new Error(
                `Multiple files found to write the config ${key} for target ${this.target}`
            );
        }

        if (filesWithConfig.length === 0 && filesWithTarget.length === 0) {
            throw new Error(
                `No files found to write the config ${key} for target ${this.target}`
            );
        }

        return [...filesWithConfig, ...filesWithTarget][0];
    }

    public async load() {
        return await this.stateCache.value;
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
