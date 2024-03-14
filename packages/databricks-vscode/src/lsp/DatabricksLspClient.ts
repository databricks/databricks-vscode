import {Disposable, window} from "vscode";
import {Trace} from "vscode-jsonrpc";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import {WebSocket, createWebSocketStream} from "ws";

export class DatabricksLspClient implements Disposable {
    private disposables: Disposable[] = [];

    public async init() {
        const serverOptions: ServerOptions = async () => {
            const ws = new WebSocket("ws://localhost:12345");
            await new Promise((resolve) => ws.on("open", resolve));
            const duplex = createWebSocketStream(ws, {encoding: "ascii"});
            return {reader: duplex, writer: duplex};
        };

        const outputChannel = window.createOutputChannel(
            "Databricks Language Server"
        );
        const clientOptions: LanguageClientOptions = {
            documentSelector: [{scheme: "file"}],
            outputChannel: outputChannel,
            traceOutputChannel: outputChannel,
        };
        const client = new LanguageClient(
            "databricks",
            "Databricks Language Server",
            serverOptions,
            clientOptions
        );
        await client.start();
        this.disposables.push(client);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
