import { existsSync } from "node:fs";
import path from "node:path";
import type { ProcessRunner } from "../../../../platform/process";

/** Where an install's output goes: the "Databricks Connect" channel. */
export interface PackageOutput {
    append(text: string): void;
    appendLine(text: string): void;
}

export interface PackagesDeps {
    readonly processes: ProcessRunner;
    /** The project root: a `uv.lock` there means the project's packages are uv's. */
    readonly root: string;
    /** The environment for pip and uv (`kernel.childEnv()`). */
    env(): Record<string, string>;
}

export interface InstalledPackage {
    readonly name: string;
    readonly version: string;
}

/**
 * Lists, installs and uninstalls packages in an interpreter: the package half
 * of the old `MsPythonExtensionWrapper`. It uses `uv pip … --python <exe>`
 * when uv is on the PATH and the project has a `uv.lock`, else
 * `<exe> -m pip`.
 */
export class Packages {
    constructor(private readonly deps: PackagesDeps) {}

    /** Every package in the interpreter's environment. Throws when pip fails. */
    async list(executable: string, signal?: AbortSignal): Promise<InstalledPackage[]> {
        const { command, args } = await this.command(executable, ["list", "--format", "json"]);
        const result = await this.deps.processes.run(command, args, {
            env: this.deps.env(),
            signal,
            closeStdin: true,
        });
        if (result.exitCode !== 0) {
            throw new Error(
                result.stderr.trim() || `${command} exited with code ${result.exitCode}`,
            );
        }
        const data = JSON.parse(result.stdout) as InstalledPackage[];
        return data.filter((p) => typeof p.name === "string" && typeof p.version === "string");
    }

    /** The package called `name`, if it is installed. */
    async find(
        executable: string,
        name: string,
        signal?: AbortSignal,
    ): Promise<InstalledPackage | undefined> {
        return (await this.list(executable, signal)).find((p) => p.name === name);
    }

    /** Installs `name`, pinned to `version` when given (`==` accepts `17.3.*`). Throws on a non-zero exit. */
    async install(
        executable: string,
        name: string,
        version: string | undefined,
        output: PackageOutput,
    ): Promise<void> {
        const { command, args } = await this.command(executable, [
            "install",
            `${name}${version ? `==${version}` : ""}`,
        ]);
        await this.runWithOutput(command, args, output);
    }

    /** Uninstalls `name` if it is installed. */
    async uninstall(executable: string, name: string, output: PackageOutput): Promise<void> {
        if ((await this.find(executable, name)) === undefined) {
            return;
        }
        const { command, args } = await this.command(executable, ["uninstall", name], ["-y"]);
        await this.runWithOutput(command, args, output);
    }

    /** The old `isUsingUv`: uv runs, and the project is locked with it. */
    async usesUv(): Promise<boolean> {
        if (!existsSync(path.join(this.deps.root, "uv.lock"))) {
            return false;
        }
        try {
            const result = await this.deps.processes.run("uv", ["--version"], {
                env: this.deps.env(),
                closeStdin: true,
            });
            return result.exitCode === 0;
        } catch {
            return false;
        }
    }

    private async command(
        executable: string,
        baseArgs: string[],
        nativePipArgs: string[] = [],
    ): Promise<{ command: string; args: string[] }> {
        if (await this.usesUv()) {
            return { command: "uv", args: ["pip", ...baseArgs, "--python", executable] };
        }
        return {
            command: executable,
            // The old `--no-python-version-warning` is a no-op that pip 25 deprecates and later releases reject.
            args: ["-m", "pip", ...baseArgs, ...nativePipArgs, "--disable-pip-version-check"],
        };
    }

    private async runWithOutput(
        command: string,
        args: string[],
        output: PackageOutput,
    ): Promise<void> {
        output.appendLine(`Running: ${command} ${args.join(" ")}`);
        const result = await this.deps.processes.run(command, args, {
            env: this.deps.env(),
            closeStdin: true,
            onStdout: (chunk) => output.append(chunk),
            onStderr: (chunk) => output.append(chunk),
        });
        if (result.exitCode !== 0) {
            throw new Error(`Command exited with code ${result.exitCode}`);
        }
    }
}
