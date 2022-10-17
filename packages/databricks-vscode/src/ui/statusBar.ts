import {Command, StatusBarAlignment, StatusBarItem, window} from "vscode";

export class DatabricksStatusBarItem {
    private readonly _statusBarItem: StatusBarItem;

    constructor(
        command: string,
        name: string,
        private readonly placeholder: string,
        tooltip?: string,
        private readonly icon?: string,
        alignment?: StatusBarAlignment,
        priority?: number
    ) {
        this._statusBarItem = window.createStatusBarItem(alignment, priority);
        this._statusBarItem.name = name;
        this._statusBarItem.tooltip = tooltip;
        this._statusBarItem.text = placeholder;
        this._statusBarItem.command = command;
        this._statusBarItem.show();
    }

    update(text?: string) {
        if (!text || text.length === 0) {
            text = this.placeholder;
        }
        this._statusBarItem.text = `$(${this.icon}) ${text}`;
        this._statusBarItem.show();
    }
}
