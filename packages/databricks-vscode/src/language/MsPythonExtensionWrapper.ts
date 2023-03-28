import {randomUUID} from "crypto";
import {Extension, Uri, Event, window, Disposable} from "vscode";
import {IExtensionApi as MsPythonExtensionApi} from "./MsPythonExtensionApi";

export class MsPythonExtensionWrapper {
    public readonly api: MsPythonExtensionApi;
    constructor(
        private readonly pythonExtension: Extension<MsPythonExtensionApi>,
        private readonly workspaceFolder: Uri
    ) {
        this.api = pythonExtension.exports as MsPythonExtensionApi;
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
        const terminalName = `databricks-pip-${randomUUID().slice(0, 8)}`;
        const terminal = window.createTerminal({
            name: terminalName,
            isTransient: true,
        });
        terminal.sendText(`${command}; exit $?`);

        const disposables: Disposable[] = [terminal];
        const exitCode = await new Promise<number | undefined>((resolve) => {
            disposables.push(
                window.onDidCloseTerminal((e) => {
                    if (e.name !== terminalName) {
                        return;
                    }
                    resolve(e.exitStatus?.code);
                })
            );
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
            `-m pip uninstall ${name} --disable-pip-version-check --no-python-version-warning`,
        ].join(" ");
        const exitCode = await this.executeInTerminalE(execCommand);
        if (exitCode) {
            throw new Error(
                `Error while un-installing ${name} package from the current python environment.`
            );
        }
    }
}
