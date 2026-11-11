import { Emitter } from "../platform/event";
import type { IExtensionApi, ResolvedEnvironment } from "../features/python/msPythonApi";
import { PYTHON } from "../kernel/extensionDependencies";
import { host, Uri } from "./vscode";

/** A resolved environment as ms-python reports one. `environment` is undefined for a global interpreter. */
export function resolvedEnvironment(options: {
    executable: string;
    version?: [number, number, number];
    name?: string;
    type?: string;
    tools?: string[];
    sysPrefix?: string;
    global?: boolean;
}): ResolvedEnvironment {
    const [major, minor, micro] = options.version ?? [3, 11, 4];
    return {
        id: options.executable,
        path: options.executable,
        tools: options.tools ?? [],
        environment: options.global
            ? undefined
            : {
                  type: options.type ?? "VirtualEnvironment",
                  name: options.name ?? ".venv",
                  folderUri: Uri.file(options.sysPrefix ?? "/env") as never,
                  workspaceFolder: undefined,
              },
        executable: {
            uri: Uri.file(options.executable) as never,
            bitness: "64-bit",
            sysPrefix: options.sysPrefix ?? "/env",
        },
        version: {
            major,
            minor,
            micro,
            release: undefined as never,
            sysVersion: `${major}.${minor}.${micro}`,
        },
    } as unknown as ResolvedEnvironment;
}

/**
 * The ms-python extension, installed into the `vscode` stand-in: the active
 * environment per window (not per resource), and its change events.
 */
export class FakeMsPython {
    active?: ResolvedEnvironment;
    activations = 0;
    /** The environments ms-python lists. */
    known: ResolvedEnvironment[] = [];
    readonly lookups: string[] = [];
    /** What `updateActiveEnvironmentPath` was called with. */
    readonly adopted: { path: string; resource?: string }[] = [];
    private readonly activeChanged = new Emitter<{ id: string; path: string }>();
    private readonly executionChanged = new Emitter<unknown>();

    constructor(
        private readonly options: { withSettings?: boolean; selectOnUpdate?: boolean } = {},
    ) {}

    readonly api = this.createApi();

    private createApi() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the API's `known` getter reads the fake's list.
        const fake = this;
        return {
            ready: Promise.resolve(),
            settings: undefined as unknown,
            environments: {
                getActiveEnvironmentPath: (resource?: { fsPath: string }) => {
                    this.lookups.push(resource?.fsPath ?? "");
                    return {
                        id: this.active?.path ?? "",
                        path: this.active?.path ?? "/nonexistent/python",
                    };
                },
                resolveEnvironment: async (env: { path?: string } | string) => {
                    const p = typeof env === "string" ? env : env.path;
                    return this.known.find((k) => k.path === p) ?? this.active;
                },
                get known() {
                    return fake.known;
                },
                refreshEnvironments: async () => {},
                onDidChangeActiveEnvironmentPath: this.activeChanged.event,
                updateActiveEnvironmentPath: async (
                    environment: string,
                    resource?: { fsPath: string },
                ) => {
                    this.adopted.push({ path: environment, resource: resource?.fsPath });
                    if (this.options.selectOnUpdate) {
                        this.select(this.known.find((k) => k.path === environment) ?? this.active);
                    }
                },
            },
        };
    }

    /** Adds the extension, inactive until something activates it. */
    install(): this {
        if (this.options.withSettings) {
            this.api.settings = { onDidChangeExecutionDetails: this.executionChanged.event };
        }
        const extension = {
            isActive: false,
            exports: this.api,
            activate: async () => {
                this.activations++;
                extension.isActive = true;
                return this.api;
            },
        };
        host.extensions.set(PYTHON.id, extension);
        return this;
    }

    /** The user selected another interpreter. */
    select(env: ResolvedEnvironment | undefined): void {
        this.active = env;
        if (this.api.settings !== undefined) {
            this.executionChanged.fire(undefined);
        } else {
            this.activeChanged.fire({ id: env?.path ?? "", path: env?.path ?? "" });
        }
    }

    get asApi(): IExtensionApi {
        return this.api as unknown as IExtensionApi;
    }
}
