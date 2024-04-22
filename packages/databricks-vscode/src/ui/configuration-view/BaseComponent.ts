import {Disposable, EventEmitter} from "vscode";
import {ConfigurationTreeItem} from "./types";

export abstract class BaseComponent implements Disposable {
    protected disposables: Disposable[] = [];
    protected onDidChangeEmitter = new EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;
    constructor() {}

    public abstract getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]>;

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
