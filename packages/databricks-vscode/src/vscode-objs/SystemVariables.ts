import {Uri} from "vscode";

export class SystemVariables {
    constructor(private readonly _workspacePath: Uri) {}

    resolve(s: string) {
        const regex = /\$\{(.*?)\}/;

        return s.replace(regex, (substr: string, key: string) => {
            if ((this as any)[key]) {
                return (this as any)[key];
            }
            return substr;
        });
    }
    get cwd() {
        return this._workspacePath.fsPath;
    }

    get workspaceRoot() {
        return this._workspacePath.fsPath;
    }

    get workspaceFolder() {
        return this._workspacePath.fsPath;
    }
}
