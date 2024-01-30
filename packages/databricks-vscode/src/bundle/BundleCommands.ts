import {Disposable, ProgressLocation, window} from "vscode";
import {BundleRemoteStateModel} from "./models/BundleRemoteStateModel";
import {onError} from "../utils/onErrorDecorator";
import {BundleWatcher} from "./BundleWatcher";

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];
    private outputChannel = window.createOutputChannel(
        "Databricks Asset Bundles"
    );

    constructor(
        private bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleWatcher: BundleWatcher
    ) {
        this.disposables.push(
            this.outputChannel,
            this.bundleWatcher.onDidChange(async () => {
                await this.bundleRemoteStateModel.refresh();
            })
        );
    }

    async refreshRemoteState() {
        await window.withProgress(
            {location: {viewId: "dabsResourceExplorerView"}},
            async () => {
                await this.bundleRemoteStateModel.refresh();
            }
        );
    }

    @onError({popup: {prefix: "Error refreshing remote state."}})
    async refreshRemoteStateCommand() {
        await this.refreshRemoteState();
    }

    async deploy() {
        this.outputChannel.show(true);
        this.outputChannel.appendLine("");

        const writeToChannel = (data: string) => {
            this.outputChannel.append(data);
        };
        await window.withProgress(
            {location: ProgressLocation.Notification, cancellable: false},
            async () => {
                await this.bundleRemoteStateModel.deploy(
                    writeToChannel,
                    writeToChannel
                );
            }
        );

        await this.refreshRemoteState();
    }

    @onError({popup: {prefix: "Error deploying the bundle."}})
    async deployCommand() {
        await this.deploy();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
