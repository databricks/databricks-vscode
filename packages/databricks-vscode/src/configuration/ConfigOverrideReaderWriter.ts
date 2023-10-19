import {EventEmitter} from "vscode";
import {Mutex} from "../locking";
import {StateStorage} from "../vscode-objs/StateStorage";
import {OverrideableConfigs} from "./types";

export class ConfigOverrideReaderWriter {
    private writeMutex = new Mutex();
    private onDidChangeEmitter = new EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly storage: StateStorage) {}

    /**
     * Write the config as an override to the bundle.
     * @param key the key to write
     * @param target the bundle target to write to
     * @param value the value to write. If undefined, the override is removed.
     * @returns status of the write
     */
    @Mutex.synchronise("writeMutex")
    async write<T extends keyof OverrideableConfigs>(
        key: T,
        target: string,
        value?: OverrideableConfigs[T]
    ) {
        const data = this.storage.get("databricks.bundle.overrides");
        if (data[target]?.[key] !== undefined) {
            if (data[target] === undefined) {
                data[target] = {};
            }
            data[target][key] = value;
            await this.storage.set("databricks.bundle.overrides", data);
            this.onDidChangeEmitter.fire();
        }
        return true;
    }

    /**
     * Read the value from storage overrides.
     * @param key the key to read
     * @param target the bundle target to read from
     * @returns the value id override
     */

    async readAll(target: string) {
        return this.storage.get("databricks.bundle.overrides")[target];
    }

    async read<T extends keyof OverrideableConfigs>(
        key: T,
        target: string
    ): Promise<OverrideableConfigs[T] | undefined> {
        return this.storage.get("databricks.bundle.overrides")[target]?.[key];
    }
}
