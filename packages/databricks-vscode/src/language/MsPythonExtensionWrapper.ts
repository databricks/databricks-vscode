import {
    Extension,
    Uri,
    Event,
    window,
    Disposable,
    workspace,
    RelativePattern,
    Terminal,
} from "vscode";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {IExtensionApi as MsPythonExtensionApi} from "./MsPythonExtensionApi";
import * as os from "node:os";
import * as path from "node:path";
import {mkdtemp, readFile} from "fs/promises";
import {Mutex} from "../locking";
import * as child_process from "node:child_process";
import {promisify} from "node:util";
export const execFile = promisify(child_process.execFile);

export class MsPythonExtensionWrapper implements Disposable {
    public readonly api: MsPythonExtensionApi;
    private readonly disposables: Disposable[] = [];
    private readonly terminalMutex: Mutex = new Mutex();
    private _terminal?: Terminal;
    constructor(
        pythonExtension: Extension<MsPythonExtensionApi>,
        private readonly workspaceFolder: Uri,
        private readonly workspaceStateManager: WorkspaceStateManager
    ) {
        this.api = pythonExtension.exports as MsPythonExtensionApi;
        this.onDidChangePythonExecutable(async () => {
            try {
                await this.terminalMutex.wait();
                this.terminal.dispose();
                this._terminal = undefined;
            } finally {
                this.terminalMutex.signal();
            }
        }, this);
    }

    get terminal() {
        if (this._terminal) {
            return this._terminal;
        }
        const terminalName = `databricks-pip-${this.workspaceStateManager.fixedUUID.slice(
            0,
            8
        )}`;

        this._terminal = window.createTerminal({
            name: terminalName,
            isTransient: true,
        });
        this.disposables.push(this._terminal);
        return this._terminal;
    }

    async getPythonExecutable() {
        if (this.api.settings) {
            return (
                this.api.settings.getExecutionDetails(this.workspaceFolder)
                    .execCommand ?? []
            ).join(" ");
        }
        return (
            await this.api.environments.resolveEnvironment(
                this.api.environments.getActiveEnvironmentPath(
                    this.workspaceFolder
                )
            )
        )?.executable.uri?.fsPath;
    }

    get onDidChangePythonExecutable(): Event<Uri | undefined> {
        if (this.api.settings) {
            return this.api.settings.onDidChangeExecutionDetails;
        }
        return (f) =>
            this.api.environments.onDidChangeActiveEnvironmentPath((e) =>
                f(Uri.file(e.path))
            );
    }

    get pythonEnvironment() {
        return this.api.environments?.resolveEnvironment(
            this.api.environments?.getActiveEnvironmentPath()
        );
    }

    private async executeInTerminalE(command: string) {
        const dir = await mkdtemp(path.join(os.tmpdir(), "databricks-vscode-"));
        const filePath = path.join(dir, "python-terminal-output.txt");

        const disposables: Disposable[] = [];
        const exitCodePromise = new Promise<number | undefined>((resolve) => {
            const fsWatcher = workspace.createFileSystemWatcher(
                new RelativePattern(dir, path.basename(filePath))
            );
            const handleFileChange = async () => {
                try {
                    const fileData = await readFile(filePath, "utf-8");
                    resolve(parseInt(fileData));
                } catch (e: unknown) {
                    resolve(undefined);
                }
            };
            disposables.push(
                fsWatcher,
                fsWatcher.onDidCreate(handleFileChange),
                fsWatcher.onDidChange(handleFileChange)
            );
        });

        try {
            await this.terminalMutex.wait();
            this.terminal.show();
            this.terminal.sendText(`${command}; echo $? > ${filePath}`);
            const exitCode = await exitCodePromise;
            return exitCode;
        } finally {
            disposables.forEach((i) => i.dispose());
            this.terminalMutex.signal();
        }
    }

    async findLatestPackageVersion(name: string) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            return;
        }
        const {stdout} = await execFile(
            executable,
            [
                "-m",
                "pip",
                "index",
                "versions",
                name,
                "--disable-pip-version-check",
                "--no-python-version-warning",
            ],
            {shell: false}
        );
        const match = stdout.match(/.+\((.+)\)/);
        if (match) {
            return match[1];
        }
    }

    async findPackageInEnvironment(name: string, version?: string) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            return false;
        }
        if (version === "latest") {
            version = await this.findLatestPackageVersion(name);
        }

        const {stdout} = await execFile(
            executable,
            [
                "-m",
                "pip",
                "list",
                "--format",
                "json",
                "--disable-pip-version-check",
                "--no-python-version-warning",
            ],
            {shell: false}
        );

        const data: Array<{name: string; version: string}> = JSON.parse(stdout);
        const target = data.find(
            (item) =>
                item.name === name &&
                (version === undefined || item.version === version)
        );
        return target !== undefined;
    }

    async installPackageInEnvironment(name: string, version?: string) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            throw Error("No python executable found");
        }
        if (version === "latest") {
            version = await this.findLatestPackageVersion(name);
        }
        const execCommand = `'${executable}' -m pip install '${name}${
            version ? `==${version}` : ""
        }' --disable-pip-version-check --no-python-version-warning`;

        const exitCode = await this.executeInTerminalE(execCommand);
        if (exitCode) {
            throw new Error(
                `Error while installing ${name} package in the current python environment.`
            );
        }
    }

    async uninstallPackageFromEnvironment(name: string) {
        const exists = await this.findPackageInEnvironment(name);
        const executable = await this.getPythonExecutable();

        if (!exists || !executable) {
            return;
        }

        const execCommand = `'${executable}' -m pip uninstall '${name}' --disable-pip-version-check --no-python-version-warning -y`;
        const exitCode = await this.executeInTerminalE(execCommand);
        if (exitCode) {
            throw new Error(
                `Error while un-installing ${name} package from the current python environment.`
            );
        }
    }

    dispose() {}
}
