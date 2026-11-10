import { isDeepStrictEqual } from "node:util";
import type { Event, Memento } from "vscode";
import { Emitter } from "./event";

export type StateLocation = "global" | "workspace";

/**
 * A persisted value. Keys are declared next to the code that owns them, and
 * keep the names the old extension used.
 */
export interface StateKey<T> {
    readonly name: string;
    readonly location: StateLocation;
    readonly defaultValue: T;
}

export function stateKey<T>(name: string, location: StateLocation, defaultValue: T): StateKey<T> {
    return { name, location, defaultValue };
}

/** Typed access to `globalState` and `workspaceState`. */
export class StateStore {
    private readonly emitters = new Map<string, Emitter<void>>();
    /** Writes run one at a time, so a read-compare-write can't interleave. */
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly mementos: Record<StateLocation, Memento>) {}

    get<T>(key: StateKey<T>): T {
        const value = this.mementos[key.location].get<T>(key.name);
        // Callers may mutate what they get; the stored copy must not change.
        return structuredClone(value ?? key.defaultValue);
    }

    set<T>(key: StateKey<T>, value: T | undefined): Promise<void> {
        const write = this.queue.then(async () => {
            const memento = this.mementos[key.location];
            if (isDeepStrictEqual(memento.get(key.name), value)) {
                return;
            }
            await memento.update(key.name, value);
            this.emitters.get(key.name)?.fire();
        });
        this.queue = write.catch(() => {});
        return write;
    }

    onDidChange(key: StateKey<unknown>): Event<void> {
        let emitter = this.emitters.get(key.name);
        if (emitter === undefined) {
            emitter = new Emitter<void>();
            this.emitters.set(key.name, emitter);
        }
        return emitter.event;
    }

    dispose() {
        this.emitters.forEach((e) => e.dispose());
        this.emitters.clear();
    }
}
