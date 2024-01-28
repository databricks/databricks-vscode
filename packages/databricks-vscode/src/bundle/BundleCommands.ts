import {Disposable, window} from "vscode";
import {BundleRemoteStateModel} from "./models/BundleRemoteStateModel";
import {onError} from "../utils/onErrorDecorator";

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];
    private outputChannel = window.createOutputChannel(
        "Databricks Asset Bundles"
    );

    constructor(private bundleRemoteStateModel: BundleRemoteStateModel) {
        this.disposables.push(this.outputChannel);
    }

    @onError({popup: {prefix: "Error refreshing remote state."}})
    async refreshRemoteState() {
        await this.bundleRemoteStateModel.refresh();
    }

    @onError({popup: {prefix: "Error deploying the bundle."}})
    async deploy() {
        this.outputChannel.show(true);
        this.outputChannel.appendLine("");

        const writeToChannel = (data: string) => {
            this.outputChannel.append(data);
        };
        await window.withProgress(
            {location: {viewId: "dabsResourceExplorerView"}},
            async () => {
                await this.bundleRemoteStateModel.deploy(
                    writeToChannel,
                    writeToChannel
                );
            }
        );
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
