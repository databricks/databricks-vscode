import fs from "node:fs";
import { commands, Uri, type Disposable, type Event } from "vscode";
import { PYTHON } from "../../kernel/extensionDependencies";
import { Emitter } from "../../platform/event";
import type { ExtensionDependencies } from "../../platform/extensions";
import type { Environment, IExtensionApi, ResolvedEnvironment } from "./msPythonApi";

/** The part of `kernel.extensionDependencies` this needs. */
type Dependencies = Pick<
    ExtensionDependencies,
    "available" | "require" | "activate" | "onDidChange"
>;

/**
 * The ms-python extension's API, loaded on first use (startup
 * never waits for ms-python). Ports the reading half of the old
 * `MsPythonExtensionWrapper`: the active environment and its changes, and
 * selecting an interpreter, and the environment list and
 * ms-python's own pickers for the checklist. Packages are listed
 * and installed by `setup/external/Packages`, with the interpreter read here.
 *
 * Without ms-python there is no interpreter: every read resolves to
 * undefined, and what can't work without it says the Python extension is
 * needed. If ms-python is installed or enabled later, the next read loads it
 * and `onDidChangeInterpreter` fires.
 */
export class MsPython implements Disposable {
    private api?: Promise<IExtensionApi | undefined>;
    private readonly changed = new Emitter<void>();
    /** The active interpreter may have changed. Fires only once the API is loaded. */
    readonly onDidChangeInterpreter: Event<void> = this.changed.event;
    private readonly subscriptions: Disposable[] = [];
    private apiSubscription?: Disposable;

    constructor(private readonly dependencies: Dependencies) {
        this.subscriptions.push(
            dependencies.onDidChange(PYTHON, () => {
                // ms-python was installed, enabled or removed: load it again on the next read.
                if (this.api !== undefined || this.installed) {
                    this.reset();
                    this.changed.fire();
                }
            }),
        );
    }

    /** Whether ms-python is installed and enabled (it may still fail to load). */
    get installed(): boolean {
        return this.dependencies.available(PYTHON);
    }

    /** The API, activating ms-python if it isn't yet. Undefined when it isn't installed or fails to load. */
    load(): Promise<IExtensionApi | undefined> {
        this.api ??= this.dependencies.activate<IExtensionApi>(PYTHON).then((api) => {
            if (api !== undefined) {
                this.watch(api);
            }
            return api;
        });
        return this.api;
    }

    /**
     * The active environment for `resource` (the project root), resolved; the
     * old `pythonEnvironment` getter. Undefined when ms-python is missing, no
     * interpreter is selected, or the selected one no longer exists.
     */
    async activeEnvironment(resource: string): Promise<ResolvedEnvironment | undefined> {
        const api = await this.load();
        const environments = api?.environments;
        if (environments === undefined) {
            return undefined;
        }
        const active = environments.getActiveEnvironmentPath(Uri.file(resource));
        if (!active || !fs.existsSync(active.path)) {
            return undefined;
        }
        return environments.resolveEnvironment(active);
    }

    /** The active interpreter's executable for `resource`; the old `getPythonExecutable`. */
    async executable(resource: string): Promise<string | undefined> {
        return (await this.activeEnvironment(resource))?.executable.uri?.fsPath;
    }

    /**
     * Selects `interpreterPath` for the folder `resource`, as the uv setup does
     * with the `.venv` it provisioned; without `resource`, for the window, as
     * a session window does. Throws when ms-python isn't there or failed to load:
     * the environment exists, but the editor can't use it.
     */
    async setActiveEnvironmentPath(interpreterPath: string, resource?: string): Promise<void> {
        const api = await this.load();
        if (api === undefined) {
            this.dependencies.require(PYTHON, "Selecting the Python environment");
            throw new Error(
                "The Python extension (ms-python.python) failed to load, so the new environment can't be selected.",
            );
        }
        await api.environments.updateActiveEnvironmentPath(
            interpreterPath,
            resource === undefined ? undefined : Uri.file(resource),
        );
    }

    /**
     * The environments ms-python knows, refreshed first, without the global
     * interpreters; the old `getAvailableEnvironments`. Empty without ms-python.
     */
    async availableEnvironments(): Promise<Environment[]> {
        const api = await this.load();
        if (api === undefined) {
            return [];
        }
        await api.environments.refreshEnvironments();
        const environments: Environment[] = [];
        for (const env of api.environments.known) {
            if ((await api.environments.resolveEnvironment(env))?.environment) {
                environments.push(env);
            }
        }
        return environments;
    }

    /** ms-python's "Create Environment" flow (venv or conda). */
    async createEnvironment(): Promise<void> {
        this.dependencies.require(PYTHON, "Creating a Python environment");
        await commands.executeCommand("python.createEnvironment");
    }

    /** ms-python's own interpreter picker. */
    async selectInterpreter(): Promise<void> {
        this.dependencies.require(PYTHON, "Selecting a Python interpreter");
        await commands.executeCommand("python.setInterpreter");
    }

    dispose(): void {
        this.reset();
        this.subscriptions.forEach((s) => s.dispose());
        this.changed.dispose();
    }

    private reset(): void {
        this.apiSubscription?.dispose();
        this.apiSubscription = undefined;
        this.api = undefined;
    }

    /** The old `onDidChangePythonExecutable`: the settings event when the API has it, else the active-environment event. */
    private watch(api: IExtensionApi): void {
        this.apiSubscription?.dispose();
        const fire = () => this.changed.fire();
        this.apiSubscription = api.settings
            ? api.settings.onDidChangeExecutionDetails(fire)
            : api.environments.onDidChangeActiveEnvironmentPath(fire);
    }
}
