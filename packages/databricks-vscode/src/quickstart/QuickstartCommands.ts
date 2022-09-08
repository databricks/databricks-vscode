import {commands, ExtensionContext, Uri} from "vscode";

export class QuickstartCommands {
    constructor(private context: ExtensionContext) {}

    openQuickstartCommand() {
        return async () => {
            const uri = Uri.file(
                this.context.asAbsolutePath("README.quickstart.md")
            );
            await commands.executeCommand("markdown.showPreview", uri);
        };
    }
}
