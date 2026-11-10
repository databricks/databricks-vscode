/** Has the shape of `vscode.Disposable`, so either can stand for the other. */
export interface Disposable {
    dispose(): unknown;
}

/** Has the shape of `vscode.Event`, so either can stand for the other. */
export interface Event<T> {
    (listener: (e: T) => unknown, thisArgs?: unknown, disposables?: Disposable[]): Disposable;
}

/** Listeners subscribed to any `Emitter` and not yet disposed, for the leak budget. */
let liveListeners = 0;

export function liveListenerCount(): number {
    return liveListeners;
}

/**
 * A dependency-free `vscode.EventEmitter`. Platform code uses it so that it
 * runs under plain Node in unit tests. Its `event` is a `vscode.Event`.
 */
export class Emitter<T> {
    private listeners = new Set<(e: T) => unknown>();

    readonly event: Event<T> = (listener, thisArgs?, disposables?) => {
        const bound = (e: T) => listener.call(thisArgs, e);
        this.listeners.add(bound);
        liveListeners++;
        const subscription: Disposable = {
            dispose: () => {
                if (this.listeners.delete(bound)) {
                    liveListeners--;
                }
            },
        };
        disposables?.push(subscription);
        return subscription;
    };

    fire(event: T): void {
        // A copy: listeners may unsubscribe while the event fires.
        for (const listener of Array.from(this.listeners)) {
            listener(event);
        }
    }

    dispose(): void {
        liveListeners -= this.listeners.size;
        this.listeners.clear();
    }
}

export function disposeAll(disposables: Disposable[]): void {
    while (disposables.length > 0) {
        disposables.pop()?.dispose();
    }
}
