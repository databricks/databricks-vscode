import {env} from "vscode";

export function readCmd() {
    if (env.shell.toLowerCase().includes("powershell")) {
        return "Read-Host";
    }
    return "read";
}
