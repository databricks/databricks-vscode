import {Disposable} from "vscode";
import {StateStorage} from "../vscode-objs/StateStorage";
import {BundleFileSet} from "./BundleFileSet";
import {BundleTarget} from "./types";

/**
 * In memory view of the bundle configuration.
 *
 * All reads and writes are synchronous.
 */
export class BundleConfig implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly storage: StateStorage,
        private readonly bundleFileSet: BundleFileSet
    ) {}

    private async writeOverride() {}

    private async writeBundleFile(name: string, value: string) {}

    async getClusterId(target: BundleTarget) {
        const isDev = target.mode === "dev";

        let clusterId: string | undefined;
        if (isDev) {
            clusterId = this.storage.get("databricks.bundle.overrides")[
                target.name
            ]?.clusterId;
        }

        if (clusterId === undefined) {
            (await this.bundleFileSet.bundleDataCache.value).targets;
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
