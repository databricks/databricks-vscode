// VS Code 1.104 already has this class and passes it to providers, but it's
// only declared from 1.106. Once @types/vscode declares it, tsc reports a
// duplicate and this file goes.
declare module "vscode" {
    /** The members we use of VS Code 1.106's `LanguageModelDataPart`. */
    export class LanguageModelDataPart {
        mimeType: string;
        data: Uint8Array;
        constructor(data: Uint8Array, mimeType: string);
    }
}
