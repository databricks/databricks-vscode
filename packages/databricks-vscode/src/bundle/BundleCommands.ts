import {Disposable, window} from "vscode";
import {BundleRemoteStateModel} from "./models/BundleRemoteStateModel";
import {onError} from "../utils/onErrorDecorator";

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private bundleRemoteStateModel: BundleRemoteStateModel) {}

    @onError({popup: {prefix: "Error when refreshing remote state"}})
    async refreshRemoteState() {
        await this.bundleRemoteStateModel.refresh();
    }

    @onError({popup: {prefix: "Error when deploying the bundle"}})
    async deploy() {
        await window.withProgress(
            {location: {viewId: "dabsResourceExplorerView"}},
            async () => {
                await this.bundleRemoteStateModel.deploy();
            }
        );
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
