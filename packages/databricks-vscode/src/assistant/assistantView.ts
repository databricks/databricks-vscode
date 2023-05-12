/* eslint-disable @typescript-eslint/naming-convention */
import { window, CancellationToken, Uri, Webview, WebviewView, WebviewViewProvider, WebviewViewResolveContext, env } from "vscode";
import * as fs from "node:fs/promises";
import { ConnectionManager } from "../configuration/ConnectionManager";
import { ApiClient, LakeSenseService } from "@databricks/databricks-sdk";

export class AssistantViewProvider implements WebviewViewProvider {

    public static readonly viewType = 'assistantView';
    private _view?: WebviewView;
    private _chat?: Chat

    constructor(private readonly _extensionUri: Uri, private _connnectionManager: ConnectionManager) {
    }

    getChat(): Chat | undefined {
        if (!this._chat && this._connnectionManager.apiClient) {
            this._chat = new Chat(this._connnectionManager.apiClient);
        }
        return this._chat!;
    }

    resetChat() {
        this._chat = undefined;
        this._view?.webview.postMessage({
            command: "reset"
        });
    }

    async resolveWebviewView(webviewView: WebviewView, context: WebviewViewResolveContext<unknown>, token: CancellationToken): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            enableForms: true
        };

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            if (data.command === "submit") {
                const chat = this.getChat();
                if (!chat) {
                    return;
                }

                await webviewView.webview.postMessage({
                    command: "message",
                    user: "User",
                    text: data.text
                });

                const response = await chat.ask(data.text);

                webviewView.webview.postMessage({
                    command: "message",
                    user: "Assistant",
                    text: response
                });
            } else if (data.command === "copy") {
                await env.clipboard.writeText(data.text);
                await window.showInformationMessage("Copied to clipboard");
            }
        });
    }

    private async _getHtmlForWebview(webview: Webview) {
        const htmlFile = Uri.joinPath(
            this._extensionUri,
            "resources",
            "webview-ui",
            "assistant.html"
        );
        let html = await fs.readFile(htmlFile.fsPath, "utf8");
        html = html.replace(
            /src="[^"].*?\/toolkit.js"/g,
            `src="${this.getToolkitUri(webview, this._extensionUri)}"`
        );

        html = html.replace(/src="assistant.js"/g,
            `src="${webview.asWebviewUri(Uri.joinPath(this._extensionUri, "resources", "webview-ui", "assistant.js"))}"`);

        html = html.replace(/href="[^"].*?\/codicon.css"/g,
            `href="${webview.asWebviewUri(Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'))}"`);

        return html;
    }

    private getToolkitUri(webview: Webview, extensionUri: Uri): Uri {
        return webview.asWebviewUri(
            Uri.joinPath(
                extensionUri,
                "out",
                "toolkit.js" // A toolkit.min.js file is also available
            )
        );
    }
}


class Chat {
    private readonly lakeSenseService: LakeSenseService;
    messages: Array<{
        role: string;
        content: string;
    }>

    constructor(apiClient: ApiClient) {
        this.lakeSenseService = new LakeSenseService(apiClient);
        this.messages = [{
            role: "system",
            content: `You are a Data Science assistant within the VS Code IDE. 
Your name is LakeClippy.
You are an expert in SQL and PySpark.
When you are not confident in your answer, please tell me and don't make things up.
When you provide your answer, wrap any code blocks with their language id.`
        }];
    }

    public async ask(question: string) {
        this.messages.push({
            role: "user",
            content: question
        });

        const result = await this.lakeSenseService.completions({
            "@method": "enterpriseOpenAiServiceChatCompletionRequest",
            params: {
                model: "gpt-3.5-turbo",
                messages: this.messages
            }
        });

        const completion = JSON.parse(result.completion);
        this.messages.push({
            role: "assistant",
            content: completion.choices[0].message.content
        });

        return completion.choices[0].message.content;
    }
}