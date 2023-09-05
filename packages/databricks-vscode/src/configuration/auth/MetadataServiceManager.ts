import {logging} from "@databricks/databricks-sdk";
import {Disposable, EventEmitter} from "vscode";
import {ConnectionManager} from "../ConnectionManager";
import {MetadataService} from "./MetadataService";
import {Loggers} from "../../logger";

export class MetadataServiceManager implements Disposable {
    readonly metadataSerivce: MetadataService;
    private disposables: Disposable[] = [];
    private onDidChangeMagicEvent = new EventEmitter<void>();
    public onDidChangeMagic = this.onDidChangeMagicEvent.event;

    constructor(private readonly connctionManager: ConnectionManager) {
        this.metadataSerivce = new MetadataService(
            undefined,
            logging.NamedLogger.getOrCreate(Loggers.Extension)
        );

        this.disposables.push(
            this.metadataSerivce,
            this.connctionManager.onDidChangeState(this.updateApiClient, this),
            this.metadataSerivce.onDidChangeMagic(
                this.onDidChangeMagicEvent.fire,
                this
            ),
            this.onDidChangeMagicEvent
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
