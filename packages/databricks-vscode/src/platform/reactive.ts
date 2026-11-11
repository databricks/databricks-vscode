import { isDeepStrictEqual } from "node:util";
import type { Event } from "vscode";
import { Emitter } from "./event";

/** A value with a single writer, which tells its readers when it changes. */
export interface State<T> {
    readonly value: T;
    readonly onDidChange: Event<T>;
}

/**
 * The writable side of a `State`. Its owner keeps it and hands out the
 * read-only `State`. Setting an equal value fires nothing.
 */
export class MutableState<T> implements State<T> {
    private readonly changed = new Emitter<T>();
    readonly onDidChange: Event<T> = this.changed.event;

    constructor(
        private current: T,
        private readonly equals: (a: T, b: T) => boolean = isDeepStrictEqual,
    ) {}

    get value(): T {
        return this.current;
    }

    set(value: T): void {
        if (this.equals(this.current, value)) {
            return;
        }
        this.current = value;
        this.changed.fire(value);
    }

    dispose(): void {
        this.changed.dispose();
    }
}

export type ResourceState<T> =
    | { status: "idle" }
    | { status: "loading"; previous?: T }
    | { status: "ready"; value: T }
    | { status: "error"; error: Error; previous?: T };

export interface ResourceOptions {
    /** How long `invalidate` waits for more invalidations before loading. */
    readonly debounceMs?: number;
}

/**
 * Async state. `invalidate()` schedules a load; invalidations within
 * the debounce window coalesce into one. `refresh()` loads at once: a first
 * load or an explicit refresh has no burst to wait for. A new load aborts the
 * one in flight, and only the latest load may publish its result. While
 * loading, the last value stays readable as `previous`. Reading never starts
 * I/O.
 *
 * It replaces `CachedValue`, `Mutex`, `RWLock` and `Barrier`.
 */
export class Resource<T> implements State<ResourceState<T>> {
    private readonly state: MutableState<ResourceState<T>>;
    readonly onDidChange: Event<ResourceState<T>>;
    private generation = 0;
    private controller?: AbortController;
    private timer?: ReturnType<typeof setTimeout>;
    private waiters: ((s: ResourceState<T>) => void)[] = [];
    private busy = false;
    private disposed = false;

    constructor(
        private readonly load: (signal: AbortSignal) => Promise<T>,
        private readonly options: ResourceOptions = {},
    ) {
        // Every transition fires, even a reload that yields an equal value:
        // listeners use `loading` → `ready` to clear busy indicators.
        this.state = new MutableState<ResourceState<T>>({ status: "idle" }, (a, b) => a === b);
        this.onDidChange = this.state.onDidChange;
    }

    get value(): ResourceState<T> {
        return this.state.value;
    }

    /** The last loaded value, whether or not a reload is in progress. */
    get latest(): T | undefined {
        const s = this.state.value;
        return s.status === "ready" ? s.value : s.status === "idle" ? undefined : s.previous;
    }

    /** Schedules a load. `reason` is for logs and debugging. */
    invalidate(_reason: string): void {
        this.schedule(this.options.debounceMs ?? 0);
    }

    /** Loads now, superseding a scheduled load, and resolves as `settled()` does. */
    refresh(_reason: string): Promise<ResourceState<T>> {
        this.schedule(0);
        return this.settled();
    }

    /** Resolves once no load is scheduled or in flight. */
    settled(): Promise<ResourceState<T>> {
        if (!this.busy) {
            return Promise.resolve(this.state.value);
        }
        return new Promise((resolve) => this.waiters.push(resolve));
    }

    /**
     * Back to `idle`, dropping the last value: its inputs are gone, as when
     * the project closes. Aborts a load in flight and cancels a scheduled one.
     */
    reset(): void {
        if (this.disposed) {
            return;
        }
        this.generation++;
        this.controller?.abort();
        this.controller = undefined;
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.busy = false;
        if (this.state.value.status !== "idle") {
            this.state.set({ status: "idle" });
        }
        this.flushWaiters();
    }

    dispose(): void {
        this.disposed = true;
        this.controller?.abort();
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.busy = false;
        this.flushWaiters();
        this.state.dispose();
    }

    private schedule(delay: number): void {
        if (this.disposed) {
            return;
        }
        this.busy = true;
        this.controller?.abort();
        this.controller = undefined;
        clearTimeout(this.timer);
        this.timer = undefined;
        if (delay <= 0) {
            void this.run();
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.run();
        }, delay);
    }

    private async run(): Promise<void> {
        const generation = ++this.generation;
        const controller = new AbortController();
        this.controller = controller;
        this.state.set({ status: "loading", previous: this.latest });
        let next: ResourceState<T>;
        try {
            next = { status: "ready", value: await this.load(controller.signal) };
        } catch (e) {
            next = {
                status: "error",
                error: e instanceof Error ? e : new Error(String(e)),
                previous: this.latest,
            };
        }
        if (generation !== this.generation || this.disposed) {
            // Superseded: the newer load publishes instead.
            return;
        }
        this.controller = undefined;
        this.busy = this.timer !== undefined;
        this.state.set(next);
        if (!this.busy) {
            this.flushWaiters();
        }
    }

    private flushWaiters() {
        const waiters = this.waiters;
        this.waiters = [];
        for (const resolve of waiters) {
            resolve(this.state.value);
        }
    }
}

/**
 * A part of another `State`. It fires only when the part changes (deep
 * equality), and its `value` is always read from the source, so while any
 * listener runs, every selector of one source agrees.
 */
export function select<S, T>(
    source: State<S>,
    pick: (value: S) => T,
): State<T> & { dispose(): void } {
    const changed = new Emitter<T>();
    let last = pick(source.value);
    const subscription = source.onDidChange((value) => {
        const next = pick(value);
        if (!isDeepStrictEqual(next, last)) {
            last = next;
            changed.fire(next);
        }
    });
    return {
        get value() {
            return pick(source.value);
        },
        onDidChange: changed.event,
        dispose: () => {
            subscription.dispose();
            changed.dispose();
        },
    };
}

/** Resolves with the first value of `state` that satisfies `predicate`. */
export function when<T>(
    state: State<T>,
    predicate: (value: T) => boolean,
    signal?: AbortSignal,
): Promise<T> {
    if (predicate(state.value)) {
        return Promise.resolve(state.value);
    }
    return new Promise((resolve, reject) => {
        const subscription = state.onDidChange((value) => {
            if (predicate(value)) {
                cleanup();
                resolve(value);
            }
        });
        const onAbort = () => {
            cleanup();
            reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        const cleanup = () => {
            subscription.dispose();
            signal?.removeEventListener("abort", onAbort);
        };
        signal?.addEventListener("abort", onAbort);
    });
}
