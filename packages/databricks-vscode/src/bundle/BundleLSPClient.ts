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

        // Match all YAML files in the workspace, not just the root databricks.yml.
        // Bundle configs can include other YAML files via the "include" directive,
        // so the LSP needs to handle any .yml/.yaml file in the project.
        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                {
                    scheme: "file",
                    language: "yaml",
                    pattern: `${workspaceFolder.fsPath}/**/*.yml`,
                },
                {
                    scheme: "file",
                    language: "yaml",
                    pattern: `${workspaceFolder.fsPath}/**/*.yaml`,
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

    dispose(): Promise<void> {
        return this.stop();
    }
}
