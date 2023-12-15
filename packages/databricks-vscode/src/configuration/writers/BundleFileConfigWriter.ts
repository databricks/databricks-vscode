import {Uri} from "vscode";
import {BundleFileSet, parseBundleYaml, writeBundleYaml} from "../../bundle";
import {BundleTarget} from "../../bundle/types";
import {Mutex} from "../../locking";
import {BundleFileConfig} from "../types";
import lodash from "lodash";
/**
 * Reads and writes bundle configs. This class does not notify when the configs change.
 * We use the BundleWatcher to notify when the configs change.
 */
export class BundleFileConfigWriter {
    private readonly writeMutex = new Mutex();

    private readonly writerMapping: Record<
        keyof BundleFileConfig,
        (t: BundleTarget, v: any) => BundleTarget
    > = {
        authParams: this.setAuthParams,
        mode: this.setMode,
        host: this.setHost,
    };

    constructor(private readonly bundleFileSet: BundleFileSet) {}

    public setHost(target: BundleTarget, value: BundleFileConfig["host"]) {
        target = {...target}; // create an explicit copy so as to not modify the original object
        target.workspace = {...target.workspace, host: value};
        return target;
    }

    public setMode(target: BundleTarget, value: BundleFileConfig["mode"]) {
        target = {...target};
        target.mode = value;
        return target;
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */

    public setAuthParams(
        target: BundleTarget,
        value: BundleFileConfig["authParams"]
    ): BundleTarget {
        throw new Error("Not implemented");
    }

    async getFileToWrite<T extends keyof BundleFileConfig>(
        key: T,
        target: string
    ): Promise<Uri> {
        throw new Error("Not implemented");
    }
    /* eslint-enable @typescript-eslint/no-unused-vars */

    /**
     * Write the value to the bundle. This is silent (writes value to a bundle without prompting the user)
     * @param key the key to write
     * @param target the bundle target to write to
     * @param value the value to write. If undefined the config is removed.
     * @returns status of the write
     */
    @Mutex.synchronise("writeMutex")
    async write<T extends keyof BundleFileConfig>(
        key: T,
        target: string,
        value?: BundleFileConfig[T]
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

        if (lodash.isEqual(newTargetData, targetData)) {
            return;
        }
        data.targets = {...data.targets, [target]: newTargetData};
        await writeBundleYaml(file, data);
    }
}
