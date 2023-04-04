import {
    Extension,
    Uri,
    Event,
    window,
    Disposable,
    workspace,
    RelativePattern,
} from "vscode";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {IExtensionApi as MsPythonExtensionApi} from "./MsPythonExtensionApi";
import * as os from "node:os";
import * as path from "node:path";
import {mkdtemp, readFile} from "fs/promises";
export class MsPythonExtensionWrapper implements Disposable {
    public readonly api: MsPythonExtensionApi;
    private readonly disposables: Disposable[] = [];

    constructor(
        private readonly pythonExtension: Extension<MsPythonExtensionApi>,
        private readonly workspaceFolder: Uri,
        private readonly workspaceStateManager: WorkspaceStateManager
    ) {
        this.api = pythonExtension.exports as MsPythonExtensionApi;
        this.onDidChangePythonExecutable(() => {
            this.terminal.dispose();
        }, this);
    }

    get terminal() {
        const terminalName = `databricks-${this.workspaceStateManager.fixedUUID.slice(
            0,
            8
        )}`;
        let terminal = window.terminals.find(
            (terminal) => terminal.name === terminalName
        );
        if (!terminal) {
            terminal = window.createTerminal(terminalName);
            this.disposables.push(terminal);
        }
        return terminal;
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

    private async executeInTerminalE(command: string) {
        const dir = await mkdtemp(path.join(os.tmpdir(), "databricks-vscode-"));
        const filePath = path.join(dir, "python-terminal-output.txt");

        const disposables: Disposable[] = [];
        const exitCode = await new Promise<number | undefined>((resolve) => {
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
            this.terminal.sendText(`${command}; echo $? > ${filePath}`);
        });
        disposables.forEach((i) => i.dispose());
        return exitCode;
    }

    async findPackageInEnvironment(name: string) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            return false;
        }

        const execCommand = [
            executable,
            "-m pip list --format json --disable-pip-version-check --no-python-version-warning",
            "|",
            executable,
            `-c "import json; ip=json.loads(input()); fp=list(filter(lambda x: x[\\"name\\"] == \\"${name}\\", ip)); exit(0 if len(fp) >= 1 else 1);"`,
        ].join(" ");

        const exitCode = await this.executeInTerminalE(execCommand);
        return !exitCode;
    }

    async installPackageInEnvironment(name: string) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            throw Error("No python executable found");
        }
        const execCommand = [
            executable,
            `-m pip install ${name} --disable-pip-version-check --no-python-version-warning`,
        ].join(" ");

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

        const execCommand = [
            executable,
            `-m pip uninstall ${name} --disable-pip-version-check --no-python-version-warning -y`,
        ].join(" ");
        const exitCode = await this.executeInTerminalE(execCommand);
        if (exitCode) {
            throw new Error(
                `Error while un-installing ${name} package from the current python environment.`
            );
        }
    }

    dispose() {}
}
