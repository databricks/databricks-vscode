import {Uri} from "vscode";
import {BundleFileSet, parseBundleYaml, writeBundleYaml} from "../bundle";
import {BundleTarget} from "../bundle/types";
import {Mutex} from "../locking";
import {BundleConfigs, ConfigReaderWriter, isBundleConfig} from "./types";

/**
 * Reads and writes bundle configs. This class does not notify when the configs change.
 * We use the BundleWatcher to notify when the configs change.
 */
export class BundleConfigReaderWriter
    implements ConfigReaderWriter<keyof BundleConfigs>
{
    private readonly writeMutex = new Mutex();

    private readonly writerMapping: Record<
        keyof BundleConfigs,
        (t: BundleTarget, v: any) => BundleTarget
    > = {
        clusterId: this.setClusterId,
        authParams: this.setAuthParams,
        mode: this.setMode,
        host: this.setHost,
        workspaceFsPath: this.setWorkspaceFsPath,
    };

    private readonly readerMapping: Record<
        keyof BundleConfigs,
        (
            t?: BundleTarget
        ) => Promise<BundleConfigs[keyof BundleConfigs] | undefined>
    > = {
        clusterId: this.getClusterId,
        authParams: this.getAuthParams,
        mode: this.getMode,
        host: this.getHost,
        workspaceFsPath: this.getWorkspaceFsPath,
    };

    constructor(private readonly bundleFileSet: BundleFileSet) {}

    public async getHost(target?: BundleTarget) {
        return target?.workspace?.host;
    }
    public setHost(target: BundleTarget, value: BundleConfigs["host"]) {
        target = {...target}; // create an explicit copy so as to not modify the original object
        target.workspace = {...target.workspace, host: value};
        return target;
    }

    public async getMode(target?: BundleTarget) {
        return target?.mode;
    }
    public setMode(target: BundleTarget, value: BundleConfigs["mode"]) {
        target = {...target};
        target.mode = value;
        return target;
    }

    public async getClusterId(target?: BundleTarget) {
        return target?.compute_id;
    }
    public setClusterId(
        target: BundleTarget,
        value: BundleConfigs["clusterId"]
    ) {
        target = {...target};
        target.compute_id = value;
        return target;
    }

    public async getWorkspaceFsPath(
        target?: BundleTarget
    ): Promise<BundleConfigs["workspaceFsPath"]> {
        return target?.workspace?.file_path;
    }
    public setWorkspaceFsPath(
        target: BundleTarget,
        value: BundleConfigs["workspaceFsPath"]
    ) {
        target = {...target};
        target.workspace = {
            ...target.workspace,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            file_path: value,
        };
        return target;
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */

    public async getAuthParams(target?: BundleTarget) {
        return undefined;
    }
    public setAuthParams(
        target: BundleTarget,
        value: BundleConfigs["authParams"]
    ): BundleTarget {
        throw new Error("Not implemented");
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
            return (
                defaultTarget ??
                Object.keys(targets).find(
                    (target) => targets[target].mode === "dev"
                )
            );
        });
    }

    async getFileToWrite<T extends keyof BundleConfigs>(
        key: T,
        target: string
    ) {
        const priorityList: {uri: Uri; priority: number}[] = [];
        await this.bundleFileSet.forEach(async (data, file) => {
            // try to find a file which has the config
            if (
                (await this.readerMapping[key](data.targets?.[target])) !==
                undefined
            ) {
                priorityList.push({
                    uri: file,
                    priority: 1,
                });
                return;
            }

            // If no file has the config, try to find a file which has the target
            if (data.targets?.[target] !== undefined) {
                priorityList.push({
                    uri: file,
                    priority: 2,
                });
                return;
            }
        });
        priorityList.sort((a, b) => a.priority - b.priority);

        return priorityList.length > 0 ? priorityList[0].uri : undefined;
    }

    /**
     * Write the value to the bundle. This is silent (writes value to a bundle without prompting the user)
     * @param key the key to write
     * @param target the bundle target to write to
     * @param value the value to write. If undefined the config is removed.
     * @returns status of the write
     */
    @Mutex.synchronise("writeMutex")
    async write<T extends keyof BundleConfigs>(
        key: T,
        target: string,
        value?: BundleConfigs[T]
    ) {
        const file = await this.getFileToWrite(key, target);
        if (file === undefined) {
            throw new Error(
                `Can't find a file to write property '${key}' of target '${target}'.`
            );
        }
        const data = await parseBundleYaml(file);
        const targetData = data.targets?.[target];
        if (targetData === undefined) {
            throw new Error(`No target '${target}' for writing '${key}.`);
        }

        const newTargetData = this.writerMapping[key](targetData, value);
        if (JSON.stringify(newTargetData) === JSON.stringify(targetData)) {
            return;
        }
        data.targets = {...data.targets, [target]: newTargetData};
        await writeBundleYaml(file, data);
    }

    /**
     * Read the config from the bundle.
     * @param key config key to reead
     * @param target target to read from
     * @returns value of the config
     */
    async read<T extends keyof BundleConfigs>(key: T, target: string) {
        const targetObject = (await this.bundleFileSet.bundleDataCache.value)
            .targets?.[target];
        return (await this.readerMapping[key](targetObject)) as
            | BundleConfigs[T]
            | undefined;
    }

    async readAll(target: string) {
        const configs = {} as any;
        for (const key of Object.keys(this.readerMapping)) {
            if (!isBundleConfig(key)) {
                continue;
            }
            configs[key] = await this.read(key, target);
        }
        return configs as BundleConfigs;
    }
}
