import {Disposable, ExtensionContext, window} from "vscode";
import {
    ServerOptions,
    LanguageClientOptions,
    LanguageClient,
} from "vscode-languageclient/node";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";

export class DltLsp implements Disposable {
    private disposables: Disposable[] = [];
    private client?: LanguageClient;

    constructor(
        private readonly context: ExtensionContext,
        private readonly pythonExtension: MsPythonExtensionWrapper
    ) {}

    async start() {
        const serverOptions: ServerOptions = {
            command: (await this.pythonExtension.getPythonExecutable()) ?? "",
            args: ["-m", "lsp_server"], // the entry point is /lspServer/__main__.py
            options: {cwd: this.context.asAbsolutePath("")},
        };

        const outputChannel = window.createOutputChannel("Databricks LSP");
        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                {scheme: "file", language: "python"},
                {scheme: "untitle", language: "python"},
            ],
            outputChannelName: "Databricks LSP",
            outputChannel: outputChannel,
        };

        this.client = new LanguageClient(
            "databricksLsp",
            "Databricks LSP",
            serverOptions,
            clientOptions
        );

        this.client.start();
    }

    dispose() {
        this.client?.stop();
        this.disposables.forEach((i) => i.dispose());
    }
}
