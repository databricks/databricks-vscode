import { CancelledError } from "./errors";

/** Waits `ms`, or throws `CancelledError` when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new CancelledError());
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new CancelledError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/** Settles as `promise` does, or throws `CancelledError` once `signal` aborts first. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal === undefined) {
        return promise;
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(new CancelledError());
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        );
    });
}
