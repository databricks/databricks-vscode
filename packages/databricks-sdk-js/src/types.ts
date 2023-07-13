export interface CancellationToken {
    isCancellationRequested: boolean;
    onCancellationRequested: (f: (e?: any) => any, ...args: any) => any;
}

/**
 * A function that, when invoked, returns a promise that will be fulfilled with
 * a value of type T.
 */
export interface Provider<T> {
    (): Promise<T>;
}

export interface EmptyResponse {}
