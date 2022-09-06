import {Disposable, ExtensionContext} from "vscode";

export class ExtensionContextManager implements Disposable {
    private static _instance: ExtensionContextManager;
    constructor(private readonly context: ExtensionContext) {
        ExtensionContextManager._instance = this;
    }

    public static get() {
        return ExtensionContextManager._instance.context;
    }

    public dispose() {}
}
