import {Disposable} from "vscode";
import {BundleModel} from "./BundleModel";
import {BundleTargetWithName} from "./BundleTargetsDataProvider";

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private readonly bundleModel: BundleModel) {}

    selectTarget(bundleTargetWithName?: BundleTargetWithName) {
        this.bundleModel.selectedTarget = bundleTargetWithName?.name;
    }
    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
