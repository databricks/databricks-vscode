import * as child_process from "node:child_process";
import {ExecException} from "node:child_process";
import {promisify} from "node:util";

const execFile = promisify(child_process.execFile);

export interface ExecFileException extends ExecException {
    stdout?: string;
    stderr?: string;
}

export class FileNotFoundException extends Error {}

export function isExecFileException(e: any): e is ExecFileException {
    return (
        e.code !== undefined ||
        e.stderr !== undefined ||
        e.stdout !== undefined ||
        e.signal !== undefined
    );
}

function isFileNotFound(e: any): e is ExecFileException {
    // when using plain execFile
    if (e.code === "ENOENT") {
        return true;
    }

    if (!isExecFileException(e)) {
        return false;
    }

    // when using execFile with shell on Linux
    if (
        e.code === 127 &&
        e.stderr &&
        e.stderr.indexOf("command not found") >= 0
    ) {
        return true;
    }

    // when using execFile with shell on Windows
    if (
        e.code === 1 &&
        e.stderr &&
        e.stderr.indexOf(
            "is not recognized as an internal or external command"
        ) >= 0
    ) {
        return true;
    }

    return false;
}

export async function execFileWithShell(
    cmd: string,
    args: Array<string>
): Promise<{
    stdout: string;
    stderr: string;
}> {
    try {
        return await execFile(cmd, args, {shell: true});
    } catch (e) {
        if (isFileNotFound(e)) {
            throw new FileNotFoundException(e.message);
        } else {
            throw e;
        }
    }
}
