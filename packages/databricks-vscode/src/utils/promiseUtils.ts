/** Settles like `promise`, or rejects with the signal's reason once it aborts. */
export function untilAborted<T>(
    promise: Promise<T>,
    signal: AbortSignal
): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted) {
            abort();
        }
        signal.addEventListener("abort", abort, {once: true});
        promise
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
    });
}
