export class Barrier<T = void> {
    public promise: Promise<T>;
    public resolve: (value: T) => void = () => {};
    public reject: (error: any) => void = () => {};
    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
