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
import fs from "node:fs";
import path from "node:path";

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
        const env = this.api.environments?.getActiveEnvironmentPath(
            this.workspaceFolderManager.activeProjectUri
        );
        if (!env || !fs.existsSync(env.path)) {
            return undefined;
        }
        return this.api.environments?.resolveEnvironment(env);
    }

    get projectRoot() {
        return this.workspaceFolderManager.activeProjectUri.fsPath;
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

    async isUsingUv() {
        try {
            await execFile("uv", ["--version"]);
            return fs.existsSync(path.join(this.projectRoot, "uv.lock"));
        } catch (error) {
            return false;
        }
    }

    private async getPipCommandAndArgs(
        executable: string,
        baseArgs: string[],
        nativePipArgs: string[] = []
    ): Promise<{command: string; args: string[]}> {
        const isUv = await this.isUsingUv();
        if (isUv) {
            return {
                command: "uv",
                args: ["pip", ...baseArgs, "--python", executable],
            };
        }
        return {
            command: executable,
            args: [
                "-m",
                "pip",
                ...baseArgs,
                ...nativePipArgs,
                "--disable-pip-version-check",
                "--no-python-version-warning",
            ],
        };
    }

    async getPackageDetailsFromEnvironment(name: string) {
        const executable = await this.getPythonExecutable();
        if (!executable) {
            return undefined;
        }

        const {command, args} = await this.getPipCommandAndArgs(executable, [
            "list",
            "--format",
            "json",
        ]);

        const {stdout} = await execFile(command, args, {
            shell: false,
        });
        const data: Array<{name: string; version: string}> = JSON.parse(stdout);
        return data.find((item) => item.name === name);
    }

    async findPackageInEnvironment(name: string) {
        return (
            (await this.getPackageDetailsFromEnvironment(name)) !== undefined
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

        const {command, args} = await this.getPipCommandAndArgs(executable, [
            "install",
            `${name}${version ? `==${version}` : ""}`,
        ]);

        outputChannel?.appendLine(`Running: ${command} ${args.join(" ")}`);
        await this.runWithOutput(command, args, outputChannel);
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

        const {command, args} = await this.getPipCommandAndArgs(
            executable,
            ["uninstall", name],
            ["-y"]
        );

        outputChannel?.appendLine(`Running: ${command} ${args.join(" ")}`);
        await this.runWithOutput(command, args, outputChannel);
    }

    async selectPythonInterpreter() {
        await commands.executeCommand("python.setInterpreter");
    }

    async createPythonEnvironment() {
        await commands.executeCommand("python.createEnvironment");
    }

    dispose() {}
}
