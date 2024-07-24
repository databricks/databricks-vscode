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

export function escapePathArgument(arg: string): string {
    return `"${arg.replaceAll('"', '\\"')}"`;
}

const metaCharsRegExp = /([()\][%!^"`<>&|;,*?])/g;

export function escapeCommand(arg: string): string {
    return `"${arg}"`;
}

export function escapeArgument(arg: string): string {
    // Convert to string
    arg = `${arg}`;

    // Algorithm below is based on https://qntm.org/cmd

    // Sequence of backslashes followed by a double quote:
    // double up all the backslashes and escape the double quote
    arg = arg.replace(/(\\*)"/g, '$1$1\\"');

    // Sequence of backslashes followed by the end of the string
    // (which will become a double quote later):
    // double up all the backslashes
    arg = arg.replace(/(\\*)$/, "$1$1");

    // All other backslashes occur literally

    // Quote the whole thing:
    arg = `"${arg}"`;

    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, "^$1");

    return arg;
}
