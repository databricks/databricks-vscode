export interface CancellationToken {
    isCancellationRequested: boolean;
    onCancellationRequested?: (f: (e?: any) => any, ...args: any) => any;
}
