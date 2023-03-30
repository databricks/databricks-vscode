import Time from "./retries/Time";

export interface AndWait<P> {
    wait(options?: {
        onProgress?: ProgressCallback<P>;
        timeout?: Time;
    }): Promise<P>;
}

export type ProgressCallback<P> = (p: P) => Promise<void>;
export type Waiter<C, P> = C & AndWait<P>;

/**
 * Takes an API response object and adds a wait method that polls
 * the API until the response is ready.
 *
 * This function is used for long running operations that complete
 * asynchronously.
 */
export function asWaiter<C, P>(
    response: C,
    poll: (options?: {
        onProgress?: ProgressCallback<P>;
        timeout?: Time;
    }) => Promise<P>
): Waiter<C, P> {
    return {
        ...response,
        wait: async (options) => {
            return await poll(options);
        },
    };
}
