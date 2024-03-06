import {copyFile, mkdir, readFile, rm, stat, writeFile} from "fs/promises";
import {Mutex} from "../../locking";
import {BaseModelWithStateCache} from "./BaseModelWithStateCache";
import {Uri} from "vscode";
import path from "path";
import {existsSync} from "fs";

export type OverrideableConfigState = {
    authProfile?: string;
    clusterId?: string;
};

export function isOverrideableConfigKey(
    key: string
): key is keyof OverrideableConfigState {
    return ["authProfile", "clusterId"].includes(key);
}

async function safeRead(filePath: Uri) {
    try {
        await stat(filePath.fsPath);
    } catch (e: any) {
        if (e.code === "ENOENT") {
            return "{}";
        }
        throw e;
    }

    return await readFile(filePath.fsPath, "utf-8");
}

export class OverrideableConfigModel extends BaseModelWithStateCache<OverrideableConfigState> {
    protected mutex = new Mutex();
    private target: string | undefined;

    static getRootOverrideFile(workspaceRoot: Uri) {
        return Uri.joinPath(
            workspaceRoot,
            ".databricks",
            "bundle",
            "vscode.overrides.json"
        );
    }

    get storageFile() {
        if (this.target === undefined) {
            return undefined;
        }

        return Uri.joinPath(
            this.workspaceRoot,
            ".databricks",
            "bundle",
            this.target,
            "vscode.overrides.json"
        );
    }

    constructor(private readonly workspaceRoot: Uri) {
        super();
    }

    @Mutex.synchronise("mutex")
    public async setTarget(target: string | undefined) {
        this.target = target;
        await this.stateCache.refresh();
    }

    protected async readState() {
        if (this.storageFile === undefined) {
            return {};
        }

        const rootOverrideFile = OverrideableConfigModel.getRootOverrideFile(
            this.workspaceRoot
        );
        // If root override file exists, use it to initialise the configs for the first selected target
        if (
            existsSync(rootOverrideFile.fsPath) &&
            !existsSync(this.storageFile.fsPath)
        ) {
            await mkdir(path.dirname(this.storageFile.fsPath), {
                recursive: true,
            });
            await copyFile(rootOverrideFile.fsPath, this.storageFile.fsPath);
            await rm(rootOverrideFile.fsPath);
        }

        return JSON.parse(await safeRead(this.storageFile));
    }

    /**
     * Write the config as an override to the bundle.
     * @param key the key to write
     * @param target the bundle target to write to
     * @param value the value to write. If undefined, the override is removed.
     * @returns status of the write
     */
    @Mutex.synchronise("mutex")
    async write<T extends keyof OverrideableConfigState>(
        key: T,
        target: string,
        value?: OverrideableConfigState[T]
    ) {
        if (this.storageFile === undefined) {
            return;
        }

        await OverrideableConfigModel._write(
            this.storageFile,
            key,
            target,
            value
        );
        await this.stateCache.refresh();
    }

    static async _write<T extends keyof OverrideableConfigState>(
        storageFile: Uri,
        key: T,
        target: string,
        value?: OverrideableConfigState[T]
    ) {
        const data = JSON.parse(await safeRead(storageFile));
        data[key] = value;
        await mkdir(path.dirname(storageFile.fsPath), {recursive: true});
        await writeFile(storageFile.fsPath, JSON.stringify(data, null, 2));
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
