import {Disposable} from "vscode";
import {ConnectionManager} from "../ConnectionManager";
import {MetadataService} from "./MetadataService";

export class MetadataServiceManager implements Disposable {
    private metadataSerivce: MetadataService;
    private disposables: Disposable[] = [];

    constructor(private readonly connctionManager: ConnectionManager) {
        this.metadataSerivce = new MetadataService();

        this.disposables.push(
            this.metadataSerivce,
            this.connctionManager.onDidChangeState(this.updateApiClient, this)
        );
    }

    async listen() {
        this.updateApiClient();
        await this.metadataSerivce.listen();
    }

    private async updateApiClient() {
        if (this.connctionManager.state === "CONNECTED") {
            await this.metadataSerivce.setApiClient(
                this.connctionManager.workspaceClient?.apiClient
            );
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
