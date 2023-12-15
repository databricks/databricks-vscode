import {StateStorage} from "../../vscode-objs/StateStorage";
import {OverrideableConfig} from "../types";
import {CachedValue} from "../../locking/CachedValue";
import {Disposable} from "vscode";

export class OverrideableConfigLoader implements Disposable {
    private disposables: Disposable[] = [];

    private readonly overrideableCofigCache = new CachedValue<
        OverrideableConfig | undefined
    >(async () => {
        if (this.target === undefined) {
            return undefined;
        }
        return this.readAll(this.target);
    });

    public readonly onDidChange = this.overrideableCofigCache.onDidChange;

    private target: string | undefined;

    constructor(private readonly storage: StateStorage) {
        this.disposables.push(
            this.storage.onDidChange("databricks.bundle.overrides")(
                async () => await this.overrideableCofigCache.refresh()
            )
        );
    }

    public async setTarget(target: string | undefined) {
        this.target = target;
    }

    private async readAll(target: string) {
        return this.storage.get("databricks.bundle.overrides")[target];
    }

    public async load() {
        return this.overrideableCofigCache.value;
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
