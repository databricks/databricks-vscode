import { errorMessage, UserFacingError } from "./errors";
import { Emitter, type Disposable, type Event } from "./event";
import type { Logger } from "./log";

/**
 * Another VS Code extension this one relies on: an entry of
 * `kernel/extensionDependencies.ts`. VS Code installs the manifest's
 * `extensionPack` with this extension but doesn't start it, and the user can
 * disable or uninstall any of them, so each use goes through
 * `ExtensionDependencies`.
 */
export interface ExtensionDependency {
    readonly id: string;
    /** As the Extensions view names it. */
    readonly name: string;
    /** In the manifest's `extensionPack`: installed with this extension. Otherwise installed when a feature needs it. */
    readonly inPack: boolean;
    /** The oldest version that will do; an older one counts as unavailable, and `install` updates it. */
    readonly minVersion?: string;
    /**
     * Resolves once the API in `exports` is usable. Some extensions, started on
     * demand, return their API before they have loaded.
     */
    readonly ready?: (exports: unknown) => PromiseLike<unknown> | undefined;
}

export function extensionDependency(
    id: string,
    name: string,
    options: { inPack?: boolean; minVersion?: string; ready?: ExtensionDependency["ready"] } = {},
): ExtensionDependency {
    return { id, name, ...options, inPack: options.inPack ?? true };
}

/** Whether `version` (`major.minor.patch`, with any suffix) is at least `minimum`. */
export function isAtLeast(version: string, minimum: string): boolean {
    const parts = (v: string) =>
        v
            .split(/[.-]/)
            .slice(0, 3)
            .map((p) => parseInt(p, 10) || 0);
    const [a, b] = [parts(version), parts(minimum)];
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return (a[i] ?? 0) > (b[i] ?? 0);
        }
    }
    return true;
}

/** What the service needs of `vscode.extensions` and the Extensions view: `vscodeExtensions` in `platform/workspace.ts`. */
export interface ExtensionHost {
    /** Undefined when the extension is missing or disabled: VS Code hides both alike. */
    get(id: string):
        | {
              readonly isActive: boolean;
              readonly exports: unknown;
              activate(): PromiseLike<unknown>;
              readonly version?: string;
          }
        | undefined;
    /** Some extension was installed, enabled, disabled, removed or updated. */
    readonly onDidChange: Event<void>;
    /** Installs, enables or updates the extension under a progress notification titled `progressTitle`. */
    install(id: string, progressTitle: string): PromiseLike<unknown>;
    /** Shows the extension's page in the Extensions view. */
    show(id: string): PromiseLike<unknown>;
}

/** No extensions: for tests and hosts without an extension registry. */
export const noExtensions: ExtensionHost = {
    get: () => undefined,
    onDidChange: () => ({ dispose: () => {} }),
    install: () => Promise.reject(new Error("Extensions can't be installed here")),
    show: async () => undefined,
};

/**
 * The other extensions this one relies on, for any feature. Nothing here
 * starts an extension except `activate`, and `install`, which installs it:
 * - the user asked for something that can't work without it: `require` first;
 * - background work: check `available`, and catch up on `onDidChange`;
 * - the extension's API is needed: `activate`, never in `register()` or at
 *   activation (`test/budgets/`).
 */
export class ExtensionDependencies implements Disposable {
    private readonly changed = new Emitter<void>();
    private readonly subscription: Disposable;

    constructor(
        private readonly host: ExtensionHost,
        private readonly log: Logger,
    ) {
        this.subscription = host.onDidChange(() => this.changed.fire());
    }

    /**
     * Whether the extension is installed, enabled and at least `minVersion`
     * (an unknown version passes), now. Starts nothing and shows nothing.
     */
    available(dep: ExtensionDependency): boolean {
        const extension = this.host.get(dep.id);
        return extension !== undefined && !this.tooOld(dep, extension.version);
    }

    /**
     * Throws, with an Install button, when the extension isn't available. The
     * first line of anything the user asked for that can't work without it:
     * a command shows the error; elsewhere pass it to `ctx.commands.showError`.
     */
    require(dep: ExtensionDependency, what: string): void {
        const extension = this.host.get(dep.id);
        if (extension === undefined) {
            throw new UserFacingError(
                "EXTENSION_MISSING",
                `${what} needs the ${dep.name} extension (${dep.id}). Install it, or enable it if it's disabled.`,
                {
                    actions: [{ title: "Install", run: () => this.install(dep) }],
                },
            );
        }
        if (this.tooOld(dep, extension.version)) {
            throw new UserFacingError(
                "EXTENSION_OUTDATED",
                `${what} needs version ${dep.minVersion} or later of the ${dep.name} extension (${dep.id}). Update it.`,
                {
                    actions: [{ title: "Update", run: () => this.install(dep) }],
                },
            );
        }
    }

    /**
     * Starts the extension if it isn't running, waits until it's ready, and
     * resolves with its API: undefined when it isn't available or fails to
     * start (logged). VS Code shares one activation between callers, so
     * nothing is cached here.
     */
    async activate<T>(dep: ExtensionDependency): Promise<T | undefined> {
        const extension = this.host.get(dep.id);
        if (extension === undefined) {
            return undefined;
        }
        try {
            const exports = extension.isActive ? extension.exports : await extension.activate();
            await dep.ready?.(exports);
            return exports as T;
        } catch (e) {
            this.log.error(`Can't load the ${dep.name} extension`, e);
            return undefined;
        }
    }

    /**
     * Calls `listener` when the extension becomes available or unavailable:
     * installed, enabled, disabled or removed. Background work catches up
     * here, and API users drop what they read from the old API.
     */
    onDidChange(dep: ExtensionDependency, listener: () => unknown): Disposable {
        // Updated only here, so a read between VS Code's change and its event can't hide a flip.
        let last = this.available(dep);
        return this.changed.event(() => {
            const now = this.available(dep);
            if (now !== last) {
                last = now;
                listener();
            }
        });
    }

    /**
     * Installs the extension, enables it if it's disabled, or updates it if
     * it's too old, with a progress notification. Behind `require`'s Install
     * and Update buttons; call it directly only where the user's action
     * already implies installing. `what` names, in the failure, what needed it.
     */
    async install(dep: ExtensionDependency, what?: string): Promise<void> {
        try {
            await this.host.install(dep.id, `Installing the ${dep.name} extension (${dep.id})`);
        } catch (e) {
            const extension = `the ${dep.name} extension (${dep.id})`;
            const message =
                what === undefined
                    ? `The ${dep.name} extension (${dep.id}) couldn't be installed: ${errorMessage(e)}`
                    : `${what} needs ${extension}, and it couldn't be installed: ${errorMessage(e)}`;
            throw new UserFacingError("EXTENSION_INSTALL_FAILED", message, {
                cause: e,
                actions: [{ title: "Show extension", run: () => this.host.show(dep.id) }],
            });
        }
    }

    dispose(): void {
        this.subscription.dispose();
        this.changed.dispose();
    }

    private tooOld(dep: ExtensionDependency, version: string | undefined): boolean {
        return (
            dep.minVersion !== undefined &&
            version !== undefined &&
            !isAtLeast(version, dep.minVersion)
        );
    }
}
