import {env} from "vscode";

export function isPowershell() {
    return env.shell.toLowerCase().includes("powershell");
}

export function readCmd() {
    if (isPowershell()) {
        return "Read-Host";
    }
    return "read";
}

export function escapeExecutableForTerminal(exe: string): string {
    if (isPowershell()) {
        return `& "${exe}"`;
    }
    return `"${exe}"`;
}

export function escapePathArgument(arg: string): string {
    return `"${arg.replaceAll('"', '\\"')}"`;
}
