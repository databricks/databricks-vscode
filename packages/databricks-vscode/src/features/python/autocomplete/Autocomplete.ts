import fs from "node:fs/promises";
import path from "node:path";
import type { Event } from "vscode";
import { Emitter } from "../../../platform/event";
import { setting, type Settings } from "../../../platform/settings";
import { stateKey, type StateStore } from "../../../platform/state";

/** The stub that declares the Databricks globals, shipped in the extension. */
export const BUILTINS_STUB = path.join("resources", "python", "stubs", "__builtins__.pyi");

/** Pylance's stub folder, relative to the workspace folder. */
const STUB_PATH = setting<string | undefined>("python", "analysis.stubPath", undefined);

/** "Never for this workspace". */
export const SKIP_CONFIGURE = stateKey<boolean>(
    "databricks.autocompletion.skipConfigure",
    "workspace",
    false,
);

export const CONTINUE = "Continue";
export const CANCEL = "Cancel";
export const NEVER_FOR_THIS_WORKSPACE = "Never for this workspace";

export interface AutocompleteDeps {
    /** `BUILTINS_STUB`, resolved against the extension. */
    readonly stubSource: string;
    /** The workspace folder Pylance analyses the project in. */
    workspaceFolder(): string;
    readonly settings: Settings;
    readonly state: StateStore;
    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
}

/**
 * Autocomplete for the Databricks globals (PYENV-09): `spark`, `dbutils`,
 * `display` and the others, declared by appending the extension's stub to
 * `__builtins__.pyi` in the workspace folder (or in `python.analysis.stubPath`
 * under it). Ports the old `ConfigureAutocomplete`.
 *
 * Removed: on every activation the old class rewrote the user-level
 * `python.analysis.extraPaths` to drop the extension's former stub folder,
 * copying workspace-level paths into user settings on the way.
 */
export class Autocomplete {
    private readonly updated = new Emitter<void>();
    /** The builtins file was written, or the user chose "Never for this workspace". */
    readonly onDidUpdate: Event<void> = this.updated.event;

    constructor(private readonly deps: AutocompleteDeps) {}

    get builtinsPath(): string {
        const root = this.deps.workspaceFolder();
        const stubPath = this.deps.settings.get(STUB_PATH);
        // Pylance reads a relative stubPath from the workspace folder, and an absolute one as it is.
        return path.join(stubPath ? path.resolve(root, stubPath) : root, "__builtins__.pyi");
    }

    /**
     * Whether to offer the builtins: not declined for this workspace, and the
     * builtins file doesn't contain the stub yet. Throws when the stub can't
     * be read.
     */
    async shouldSetupBuiltins(): Promise<boolean> {
        if (this.deps.state.get(SKIP_CONFIGURE)) {
            return false;
        }
        const stub = await this.stub();
        try {
            return !(await fs.readFile(this.builtinsPath, "utf-8")).includes(stub);
        } catch {
            return true;
        }
    }

    /** `databricks.autocomplete.configure`: asks again even if declined before. */
    async configure(): Promise<void> {
        await this.deps.state.set(SKIP_CONFIGURE, false);
        if (!(await this.shouldSetupBuiltins())) {
            return;
        }
        const builtinsPath = this.builtinsPath;
        const choice = await this.deps.showInformationMessage(
            `Create ${builtinsPath}?`,
            CONTINUE,
            CANCEL,
            NEVER_FOR_THIS_WORKSPACE,
        );
        if (choice === NEVER_FOR_THIS_WORKSPACE) {
            await this.deps.state.set(SKIP_CONFIGURE, true);
            this.updated.fire();
        } else if (choice === CONTINUE) {
            await fs.mkdir(path.dirname(builtinsPath), { recursive: true });
            await fs.appendFile(builtinsPath, `\n${await this.stub()}\n`);
            this.updated.fire();
        }
    }

    dispose(): void {
        this.updated.dispose();
    }

    private async stub(): Promise<string> {
        try {
            return await fs.readFile(this.deps.stubSource, "utf-8");
        } catch (e) {
            throw new Error(
                `Can't read internal type stubs for autocompletion. ${e instanceof Error ? e.message : String(e)}`,
                { cause: e },
            );
        }
    }
}
