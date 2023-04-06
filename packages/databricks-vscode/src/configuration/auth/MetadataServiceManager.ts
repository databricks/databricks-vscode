import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Disposable} from "vscode";
import {ConnectionManager} from "../ConnectionManager";
import {MetadataService} from "./MetadataService";

export class MetadataServiceManager implements Disposable {
    readonly metadataSerivce: MetadataService;
    private disposables: Disposable[] = [];

    constructor(private readonly connctionManager: ConnectionManager) {
        this.metadataSerivce = new MetadataService(
            undefined,
            NamedLogger.getOrCreate("Extension")
        );

        this.disposables.push(
            this.metadataSerivce,
            this.connctionManager.onDidChangeState(this.updateApiClient, this)
        );
    }

    async listen() {
        await this.metadataSerivce.listen();
        await this.updateApiClient();
    }

    private async updateApiClient() {
        if (this.connctionManager.state === "CONNECTED") {
            await this.metadataSerivce.setApiClient(
                this.connctionManager.workspaceClient?.apiClient
            );
        }
        this.connctionManager.metadataServiceUrl = this.metadataSerivce.url;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
