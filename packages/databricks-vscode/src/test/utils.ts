import {lstatSync, readdirSync} from "fs";
import path from "path";
import {cwd} from "process";
import {ProviderResult} from "vscode";

export async function resolveProviderResult<T>(
    result: ProviderResult<T>
): Promise<T | null | undefined> {
    if (!result) {
        return result;
    }

    if ("then" in result) {
        return await result;
    } else {
        return result;
    }
}

export function findGitRoot(curPathOpt?: string) {
    let curPath = path.resolve(curPathOpt ?? cwd());
    if (!lstatSync(curPath).isDirectory()) {
        curPath = path.dirname(curPath);
    }

    while (curPath !== "") {
        const gitDir = readdirSync(curPath).find((value) => value === ".git");
        if (gitDir) {
            return curPath;
        }
        curPath = path.dirname(curPath);
    }
}
