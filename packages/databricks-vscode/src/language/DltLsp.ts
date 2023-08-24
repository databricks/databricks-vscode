import {Disposable, ExtensionContext, window} from "vscode";
import {
    ServerOptions,
    LanguageClientOptions,
    LanguageClient,
    TransportKind,
} from "vscode-languageclient/node";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvVarGenerators} from "../utils";
import {ConnectionManager} from "../configuration/ConnectionManager";

export class DltLsp implements Disposable {
    private disposables: Disposable[] = [];
    private client?: LanguageClient;
    private outputChannel = window.createOutputChannel("Databricks LSP");
    constructor(
        private readonly context: ExtensionContext,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly connectionManager: ConnectionManager
    ) {
        this.connectionManager.onDidChangeState((state) => {
            if (state === "CONNECTED") {
                this.client?.stop();
                this.outputChannel.clear();
                this.start();
            }
        });
        this.disposables.push(this.outputChannel);
    }

    async start() {
        await this.connectionManager.waitForConnect();
        await new Promise((resolve) => {
            setTimeout(resolve, 5000);
        });
        const serverOptions: ServerOptions = {
            command: (await this.pythonExtension.getPythonExecutable()) ?? "",
            args: ["-m", "lsp_server"], // the entry point is /lspServer/__main__.py
            options: {
                cwd: this.context.asAbsolutePath(""),
                env: EnvVarGenerators.getAuthEnvVars(this.connectionManager),
            },
            transport: TransportKind.stdio,
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                {scheme: "file", language: "python"},
                {scheme: "untitle", language: "python"},
            ],
            outputChannelName: "Databricks LSP",
            outputChannel: this.outputChannel,
        };

        this.client = new LanguageClient(
            "databricksLsp",
            "Databricks LSP",
            serverOptions,
            clientOptions
        );

        this.client.start();
        this.disposables.push(this.client);
    }

    dispose() {
        this.client?.stop();
        this.disposables.forEach((i) => i.dispose());
    }
}
