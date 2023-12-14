import {EventEmitter} from "vscode";
import {Mutex} from "../locking";
import {StateStorage} from "../vscode-objs/StateStorage";
import {OverrideableConfig} from "./types";

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
    async write<T extends keyof OverrideableConfig>(
        key: T,
        target: string,
        value?: OverrideableConfig[T]
    ) {
        const data = this.storage.get("databricks.bundle.overrides");
        if (data[target] === undefined) {
            data[target] = {};
        }
        const oldValue = JSON.stringify(data[target][key]);
        if (oldValue === JSON.stringify(value)) {
            return;
        }
        data[target][key] = value;
        await this.storage.set("databricks.bundle.overrides", data);
        this.onDidChangeEmitter.fire();
    }

    async readAll(target: string) {
        return this.storage.get("databricks.bundle.overrides")[target];
    }
}
