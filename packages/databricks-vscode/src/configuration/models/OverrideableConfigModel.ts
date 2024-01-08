import {StateStorage} from "../../vscode-objs/StateStorage";
import {OverrideableConfig} from "../types";
import {CachedValue} from "../../locking/CachedValue";
import {Disposable} from "vscode";
import {Mutex} from "../../locking";

export class OverrideableConfigModel implements Disposable {
    private writeMutex = new Mutex();

    private disposables: Disposable[] = [];

    private readonly stateCache = new CachedValue<
        OverrideableConfig | undefined
    >(async () => {
        if (this.target === undefined) {
            return undefined;
        }
        return this.readState(this.target);
    });

    public readonly onDidChange = this.stateCache.onDidChange;

    private target: string | undefined;

    constructor(private readonly storage: StateStorage) {
        this.disposables.push(
            this.storage.onDidChange("databricks.bundle.overrides")(
                async () => await this.stateCache.refresh()
            )
        );
    }

    public async setTarget(target: string | undefined) {
        this.target = target;
    }

    private async readState(target: string) {
        return this.storage.get("databricks.bundle.overrides")[target];
    }

    public async load() {
        return this.stateCache.value;
    }

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
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
