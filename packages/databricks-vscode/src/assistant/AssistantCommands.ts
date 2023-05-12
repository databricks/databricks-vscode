import { AssistantViewProvider } from "./assistantView";

export class AssistantCommands {
    constructor(private assitantView: AssistantViewProvider) {
    }

    resetCommand() {
        return () => this.assitantView.resetChat();
    }
}