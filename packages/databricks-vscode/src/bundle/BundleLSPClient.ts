import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import {Disposable, Uri, workspace} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";

/**
 * Manages the lifecycle of the DABs Language Server Protocol client.
 * Spawns `databricks experimental bundle-lsp` and connects via stdio to provide
 * deployment-aware features (document links, hover) for bundle YAML files.
 */
export class BundleLSPClient implements Disposable {
    private client: LanguageClient | undefined;
    private readonly cli: CliWrapper;

    constructor(cli: CliWrapper) {
        this.cli = cli;
    }

    async start(workspaceFolder: Uri, target?: string): Promise<void> {
        // Stop existing client if running.
        await this.stop();

        const args = ["experimental", "bundle-lsp"];
        if (target) {
            args.push("--target", target);
        }

        const serverOptions: ServerOptions = {
            command: this.cli.cliPath,
            args: args,
            options: {
                cwd: workspaceFolder.fsPath,
            },
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                {
                    scheme: "file",
                    language: "yaml",
                    pattern: "**/databricks.yml",
                },
                {
                    scheme: "file",
                    language: "yaml",
                    pattern: "**/databricks.yaml",
                },
                {
                    scheme: "file",
                    language: "yaml",
                    pattern: "**/bundle.yml",
                },
                {
                    scheme: "file",
                    language: "yaml",
                    pattern: "**/bundle.yaml",
                },
            ],
            workspaceFolder: {
                uri: workspaceFolder,
                name: workspace.name ?? "workspace",
                index: 0,
            },
        };

        this.client = new LanguageClient(
            "databricks-bundle-lsp",
            "Databricks Experimental Bundle LSP",
            serverOptions,
            clientOptions
        );

        await this.client.start();
    }

    async stop(): Promise<void> {
        if (this.client) {
            try {
                await this.client.stop();
            } catch {
                // Client may already be stopped.
            }
            this.client = undefined;
        }
    }

    dispose(): void {
        this.stop();
    }
}
