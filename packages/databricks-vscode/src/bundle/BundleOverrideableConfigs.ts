import {Disposable} from "vscode";

export class BundleOverrideableConfigs implements Disposable {
    private disposables: Disposable[] = [];

    constructor() {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
