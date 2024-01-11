import {StateStorage} from "../../vscode-objs/StateStorage";
import {Mutex} from "../../locking";
import {BaseModelWithStateCache} from "./BaseModelWithStateCache";
import {onError} from "../../utils/onErrorDecorator";

export type OverrideableConfigState = {
    authProfile?: string;
    clusterId?: string;
};

export function isOverrideableConfigKey(
    key: string
): key is keyof OverrideableConfigState {
    return ["authProfile", "clusterId"].includes(key);
}

export class OverrideableConfigModel extends BaseModelWithStateCache<OverrideableConfigState> {
    protected mutex = new Mutex();
    private target: string | undefined;

    constructor(private readonly storage: StateStorage) {
        super();
        this.disposables.push(
            this.storage.onDidChange("databricks.bundle.overrides")(
                async () => await this.stateCache.refresh()
            )
        );
    }

    @Mutex.synchronise("mutex")
    public async setTarget(target: string | undefined) {
        this.target = target;
        await this.stateCache.refresh();
    }

    protected async readState() {
        if (this.target === undefined) {
            return {};
        }
        return (
            this.storage.get("databricks.bundle.overrides")[this.target] ?? {}
        );
    }

    /**
     * Write the config as an override to the bundle.
     * @param key the key to write
     * @param target the bundle target to write to
     * @param value the value to write. If undefined, the override is removed.
     * @returns status of the write
     */
    @Mutex.synchronise("mutex")
    async write<T extends keyof OverrideableConfigState>(
        key: T,
        target: string,
        value?: OverrideableConfigState[T]
    ) {
        const data = this.storage.get("databricks.bundle.overrides");
        if (data[target] === undefined) {
            data[target] = {};
        }
        data[target][key] = value;
        await this.storage.set("databricks.bundle.overrides", data);
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
