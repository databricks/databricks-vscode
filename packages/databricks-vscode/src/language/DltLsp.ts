import {Disposable, ExtensionContext, WebviewPanel, window} from "vscode";
import {
    ServerOptions,
    LanguageClientOptions,
    LanguageClient,
    TransportKind,
} from "vscode-languageclient/node";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvVarGenerators} from "../utils";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Cluster} from "@databricks/databricks-sdk";
import {readFile} from "fs/promises";

export class DltLsp implements Disposable {
    private disposables: Disposable[] = [];
    private client?: LanguageClient;
    private lspOutputChannel = window.createOutputChannel("Databricks LSP");
    private outputChannel = window.createOutputChannel("Databricks LSP Output");
    private cluster: Cluster | undefined;
    private panel?: WebviewPanel;
    constructor(
        private readonly context: ExtensionContext,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly connectionManager: ConnectionManager
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeState((state) => {
                if (state === "CONNECTED") {
                    this.start();
                }
            }),
            this.connectionManager.onDidChangeCluster((cluster) => {
                if (cluster !== this.cluster) {
                    this.cluster = cluster;
                    this.start();
                }
            }),
            this.lspOutputChannel
        );
    }

    async start() {
        await this.connectionManager.waitForConnect();
        await new Promise((resolve) => {
            setTimeout(resolve, 5000);
        });
        await this.client?.stop();
        this.lspOutputChannel.clear();
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
            outputChannel: this.lspOutputChannel,
        };

        this.client = new LanguageClient(
            "databricksLsp",
            "Databricks LSP",
            serverOptions,
            clientOptions
        );

        this.client.start();
        this.disposables.push(this.client);
        this.registerListeners();
    }
    registerListeners() {
        this.client?.onNotification("lsp/runOutput", (output: string) => {
            this.outputChannel.clear();
            this.outputChannel.append(output);
            this.outputChannel.show();
        });
        this.client?.onNotification("lsp/showImage", async (path: string) => {
            if (this.panel === undefined) {
                this.panel = window.createWebviewPanel(
                    "databricks-lsp-image",
                    "DLT Graph",
                    2
                );
                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                });
            }
            const data = await readFile(path);
            const encoded = Buffer.from(data).toString("base64");
            this.panel.webview.html = `<html><body><img src="data:image/png;base64, ${encoded}" /></body></html><!-- ${Date.now()} -->`;
            this.panel.reveal();
        });
    }
    dispose() {
        this.client?.stop();
        this.disposables.forEach((i) => i.dispose());
    }
}
