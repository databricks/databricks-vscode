import {env} from "vscode";

function shellPath() {
    return env.shell.toLowerCase();
}

export function isPowershell() {
    return shellPath().includes("powershell");
}

export function isCmd() {
    return shellPath().endsWith("cmd.exe") || shellPath().includes("\\cmd");
}

export function readCmd() {
    if (isPowershell()) {
        return "Read-Host";
    }
    if (isCmd()) {
        return "pause";
    }
    return "read";
}

export function clearCmd() {
    if (isPowershell()) {
        return "Clear-Host";
    }
    if (isCmd()) {
        return "cls";
    }
    return "clear";
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
