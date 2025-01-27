import {
    Extension,
    Uri,
    Event,
    window,
    Disposable,
    Terminal,
    commands,
    OutputChannel,
} from "vscode";
import {StateStorage} from "../vscode-objs/StateStorage";
import {IExtensionApi as MsPythonExtensionApi} from "./MsPythonExtensionApi";
import {Mutex} from "../locking";
import * as childProcess from "node:child_process";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {execFile} from "../cli/CliWrapper";

export class MsPythonExtensionWrapper implements Disposable {
    public readonly api: MsPythonExtensionApi;
    private readonly disposables: Disposable[] = [];
    private readonly terminalMutex: Mutex = new Mutex();
    private _terminal?: Terminal;
    constructor(
        pythonExtension: Extension<MsPythonExtensionApi>,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly stateStorage: StateStorage
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
        const terminalName = `databricks-pip-${this.stateStorage
            .get("databricks.fixedUUID")
            .slice(0, 8)}`;

        this._terminal = window.createTerminal({
            name: terminalName,
            isTransient: true,
        });
        this.disposables.push(this._terminal);
        return this._terminal;
    }

    async getPythonExecutable() {
        const env = await this.pythonEnvironment;
        return env?.executable.uri?.fsPath;
    }

    async getAvailableEnvironments() {
        await this.api.environments.refreshEnvironments();
        const filteredEnvs = [];
        for (const env of this.api.environments.known) {
            const resolvedEnv =
                await this.api.environments.resolveEnvironment(env);
            if (resolvedEnv && resolvedEnv.environment) {
                filteredEnvs.push(env);
            }
        }
        return filteredEnvs;
    }

    get onDidChangePythonExecutable(): Event<Uri | undefined> {
        if (this.api.settings) {
            return this.api.settings.onDidChangeExecutionDetails;
        }
        return (f) =>
            // Active environment path actually returns the path of the active interpreter
            // not the path of the active environment. It only returns path of the active
            // environment if there is no active interpreter. We do not handle this case.
            this.api.environments.onDidChangeActiveEnvironmentPath((e) =>
                f(Uri.file(e.path))
            );
    }

    get pythonEnvironment() {
        return this.api.environments?.resolveEnvironment(
            this.api.environments?.getActiveEnvironmentPath(
                this.workspaceFolderManager.activeProjectUri
            )
        );
    }

    async runWithOutput(
        command: string,
        args: string[],
        outputChannel?: OutputChannel
    ) {
        const cp = childProcess.execFile(command, args);
        cp.stdout?.on("data", (data) => outputChannel?.append(data));
        cp.stderr?.on("data", (data) => outputChannel?.append(data));
        return new Promise<void>((resolve, reject) => {
            cp.on("exit", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Command exited with code ${code}`));
                }
            });
            cp.on("error", reject);
        });
    }

    async getLatestPackageVersion(name: string) {
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

    async getPackageDetailsFromEnvironment(
        name: string,
        version?: string | RegExp
    ) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            return undefined;
        }
        if (version === "latest") {
            version = await this.getLatestPackageVersion(name);
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
        return data.find(
            (item) =>
                item.name === name &&
                (version === undefined ||
                    item.version.match(version) !== undefined)
        );
    }

    async findPackageInEnvironment(name: string, version?: string | RegExp) {
        return (
            (await this.getPackageDetailsFromEnvironment(name, version)) !==
            undefined
        );
    }

    async installPackageInEnvironment(
        name: string,
        version?: string | RegExp,
        outputChannel?: OutputChannel
    ) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            throw Error("No python executable found");
        }
        if (version === "latest") {
            version = await this.getLatestPackageVersion(name);
        }
        const args = [
            "-m",
            "pip",
            "install",
            `${name}${version ? `==${version}` : ""}`,
            "--disable-pip-version-check",
            "--no-python-version-warning",
        ];
        outputChannel?.appendLine(`Running: ${executable} ${args.join(" ")}`);
        await this.runWithOutput(executable, args, outputChannel);
    }

    async uninstallPackageFromEnvironment(
        name: string,
        outputChannel?: OutputChannel
    ) {
        const exists = await this.findPackageInEnvironment(name);
        const executable = await this.getPythonExecutable();
        if (!exists || !executable) {
            return;
        }
        const args = [
            "-m",
            "pip",
            "uninstall",
            name,
            "--disable-pip-version-check",
            "--no-python-version-warning",
            "-y",
        ];
        outputChannel?.appendLine(`Running: ${executable} ${args.join(" ")}`);
        await this.runWithOutput(executable, args, outputChannel);
    }

    async selectPythonInterpreter() {
        await commands.executeCommand("python.setInterpreter");
    }

    async createPythonEnvironment() {
        await commands.executeCommand("python.createEnvironment");
    }

    dispose() {}
}
