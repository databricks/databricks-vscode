import {Disposable, window} from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import {WebSocket, createWebSocketStream} from "ws";

export class DatabricksLspClient implements Disposable {
    private disposables: Disposable[] = [];
    private outputChannel = window.createOutputChannel(
        "Databricks Language Server"
    );
    public async init() {
        const serverOptions: ServerOptions = async () => {
            // eslint-disable-next-line no-console
            console.log("Connecting to Databricks Language Server");
            const ws = new WebSocket("ws://localhost:12345", {timeout: 30_000});
            ws.on("close", async (e) => {
                // eslint-disable-next-line no-console
                console.error("WebSocket closed", e);
            });
            await new Promise((resolve) => ws.on("open", resolve));
            const duplex = createWebSocketStream(ws, {encoding: "ascii"});
            return {reader: duplex, writer: duplex};
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{scheme: "file"}],
            outputChannel: this.outputChannel,
            traceOutputChannel: this.outputChannel,
        };
        const client = new LanguageClient(
            "databricks",
            "Databricks Language Server",
            serverOptions,
            clientOptions
        );
        client.createDefaultErrorHandler(1000);
        await client.start();
        this.disposables.push(client);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
