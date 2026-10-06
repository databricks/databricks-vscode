// VS Code 1.104 and 1.105 leave a provider's models out of the chat model
// picker unless they set this; later versions show them unless it's false.
// It's from the chatProvider proposal, which VS Code doesn't check for this
// field.
declare module "vscode" {
    export interface LanguageModelChatInformation {
        readonly isUserSelectable?: boolean;
    }
}
