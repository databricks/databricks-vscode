export class Barrier {
    public promise: Promise<void>;
    public resolve: () => void = () => {};
    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
    }
}
