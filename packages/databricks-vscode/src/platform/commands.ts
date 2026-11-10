import type { Disposable } from "vscode";
import { errorMessage, isCancellation, UserFacingError } from "./errors";
import type { Logger } from "./log";

/**
 * The scopes a command can require. The kernel adds `connection` and
 * `project` by augmenting this interface when it can provide them:
 *
 *     declare module "../platform/commands" {
 *         interface Scopes { connection: Connection }
 *     }
 */
export interface Scopes {
    window: undefined;
}

export type ScopeName = keyof Scopes;

/** Supplies the current value of a scope, and what to say when there is none. */
export interface ScopeProvider<T> {
    current(): T | undefined;
    /** For example "Sign in to Databricks", with a "Sign in" action. */
    unavailable(): UserFacingError;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Window commands receive the `executeCommand` arguments unchanged. Scoped
 * commands receive the scope value first, then those arguments, so frozen
 * signatures such as `destroy(force, warn)` are kept.
 */
export type CommandHandler<S extends ScopeName> = S extends "window"
    ? (...args: any[]) => unknown
    : (scope: Scopes[S], ...args: any[]) => unknown;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CommandOptions<S extends ScopeName> {
    readonly scope?: S;
}

/**
 * A command one feature registers and another runs, in place of an
 * untyped `executeCommand` between features. The declaration carries the
 * argument and result types, so the caller and the handler agree on them.
 * Internal commands aren't contributed.
 */
export interface InternalCommand<A, R> {
    readonly id: string;
    /** Never set: it only carries the types. */
    readonly types?: (arg: A) => R;
}

export function internalCommand<A, R>(id: string): InternalCommand<A, R> {
    return { id };
}

// A type, not an interface, so that it is assignable to telemetry properties.
export type CommandExecution = {
    readonly command: string;
    readonly success: boolean;
    readonly duration: number;
};

/** The VS Code APIs the registry needs; injectable for tests. */
export interface CommandHost {
    registerCommand(id: string, callback: (...args: unknown[]) => unknown): Disposable;
    showErrorMessage(message: string, ...actions: string[]): Thenable<string | undefined>;
    executeCommand(id: string, ...args: unknown[]): Thenable<unknown>;
}

/**
 * Registers every command the extension contributes. It records
 * `commandExecution` telemetry, checks the command's scope when it runs, and
 * renders errors exactly once. It replaces `registerCommand` on the
 * old `Telemetry` and the `@onError` decorator.
 */
export class CommandRegistry {
    private readonly scopes = new Map<string, ScopeProvider<unknown>>();
    private readonly ids = new Set<string>();

    constructor(
        private readonly host: CommandHost,
        private readonly onExecuted: (e: CommandExecution) => void,
        private readonly log: Logger,
        private readonly now: () => number = () => performance.now(),
    ) {}

    defineScope<S extends Exclude<ScopeName, "window">>(
        name: S,
        provider: ScopeProvider<Scopes[S]>,
    ): Disposable {
        this.scopes.set(name, provider);
        return { dispose: () => this.scopes.delete(name) };
    }

    register<S extends ScopeName = "window">(
        id: string,
        handler: CommandHandler<S>,
        options: CommandOptions<S> = {},
    ): Disposable {
        if (this.ids.has(id)) {
            throw new Error(`Command ${id} is already registered`);
        }
        this.ids.add(id);
        const scope = options.scope ?? "window";
        const registration = this.host.registerCommand(id, (...args) =>
            this.execute(id, scope, handler as (...args: unknown[]) => unknown, args),
        );
        return {
            dispose: () => {
                this.ids.delete(id);
                registration.dispose();
            },
        };
    }

    /**
     * Runs an internal command. It resolves to undefined when the command was
     * cancelled or failed; the failure has been rendered already.
     */
    async executeInternal<A, R>(command: InternalCommand<A, R>, arg: A): Promise<R | undefined> {
        return (await this.host.executeCommand(command.id, arg)) as R | undefined;
    }

    /** The IDs registered so far; the manifest contract test reads them. */
    registeredIds(): string[] {
        return [...this.ids];
    }

    private async execute(
        id: string,
        scope: ScopeName,
        handler: (...args: unknown[]) => unknown,
        args: unknown[],
    ): Promise<unknown> {
        const start = this.now();
        let success = true;
        try {
            if (scope === "window") {
                return await handler(...args);
            }
            const value = this.resolveScope(scope);
            return await handler(value, ...args);
        } catch (e) {
            if (isCancellation(e)) {
                this.log.debug(`Command ${id} was cancelled`);
                return undefined;
            }
            success = false;
            this.log.error(`Command ${id} failed`, e);
            this.render(id, e);
            // Resolve rather than reject: VS Code would show a second error
            // for a command that rejects.
            return undefined;
        } finally {
            this.onExecuted({
                command: id,
                success,
                duration: this.now() - start,
            });
        }
    }

    private resolveScope(scope: ScopeName): unknown {
        const provider = this.scopes.get(scope);
        if (provider === undefined) {
            throw new Error(`Scope "${scope}" is not available`);
        }
        const value = provider.current();
        if (value === undefined) {
            throw provider.unavailable();
        }
        return value;
    }

    /**
     * Shows an error raised outside a command, such as in a listener or a
     * background task, as a failed command's: the message with its actions
     * as buttons, running the one picked. Resolves when the notification is
     * dismissed or the action has run. A failed action is logged, and shown
     * too when it fails with a `UserFacingError` (an Install that couldn't
     * install, say).
     */
    async showError(error: UserFacingError): Promise<void> {
        const picked = await this.host.showErrorMessage(
            error.userMessage,
            ...error.actions.map((a) => a.title),
        );
        try {
            await error.actions.find((a) => a.title === picked)?.run();
        } catch (e) {
            this.log.error(`An action for ${error.code} failed`, e);
            if (e instanceof UserFacingError) {
                await this.showError(e);
            }
        }
    }

    private render(id: string, error: unknown) {
        if (!(error instanceof UserFacingError)) {
            void this.host.showErrorMessage(`Error running command ${id}: ${errorMessage(error)}`);
            return;
        }
        void this.showError(error);
    }
}
