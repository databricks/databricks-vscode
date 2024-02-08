import {Uri} from "vscode";
import {BundleFileSet, BundleWatcher} from "..";
import {BundleTarget} from "../types";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {UrlUtils} from "../../utils";
import {Mutex} from "../../locking";
import * as lodash from "lodash";

export type BundlePreValidateState = {
    host?: URL;
    mode?: "development" | "staging" | "production";
    authParams?: Record<string, string | undefined>;
} & BundleTarget;

/**
 * Reads and writes bundle configs. This class does not notify when the configs change.
 * We use the BundleWatcher to notify when the configs change.
 */
export class BundlePreValidateModel extends BaseModelWithStateCache<BundlePreValidateState> {
    protected mutex = new Mutex();
    private target: string | undefined;

    constructor(
        private readonly bundleFileSet: BundleFileSet,
        private readonly bunldeFileWatcher: BundleWatcher
    ) {
        super();
        this.disposables.push(
            this.bunldeFileWatcher.onDidChange(async () => {
                await this.stateCache.refresh();
            })
        );
    }

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

    protected readStateFromTarget(
        target?: BundleTarget
    ): BundlePreValidateState | undefined {
        return target
            ? {
                  ...target,
                  host: UrlUtils.normalizeHost(target?.workspace?.host ?? ""),
                  mode: target?.mode as BundlePreValidateState["mode"],
                  authParams: undefined,
              }
            : undefined;
    }

    @Mutex.synchronise("mutex")
    protected async readState() {
        if (this.target === undefined) {
            return {};
        }

        const bundle = await this.bundleFileSet.bundleDataCache.value;
        const targetObject = bundle?.targets?.[this.target];
        const globalWorkspace = bundle?.workspace;
        if (targetObject !== undefined) {
            targetObject.workspace = lodash.merge(
                targetObject.workspace ?? {},
                globalWorkspace
            );
        }

        return this.readStateFromTarget(targetObject) ?? {};
    }

    public async getFileToWrite(key: string) {
        const filesWithTarget: Uri[] = [];
        const filesWithConfig = (
            await this.bundleFileSet.findFile(async (data, file) => {
                const bundleTarget = data.targets?.[this.target ?? ""];
                if (bundleTarget === undefined) {
                    return false;
                }
                filesWithTarget.push(file);

                if (this.readStateFromTarget(bundleTarget) === undefined) {
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

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
