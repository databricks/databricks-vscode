export class Subject {
    private resolve!: () => void;
    private promise: Promise<void>;

    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    notify() {
        this.resolve();
    }

    async wait(timeout: number = 0) {
        Promise.race([
            new Promise((_resolve, reject) =>
                setTimeout(() => {
                    reject("timeout");
                }, timeout)
            ),
            this.promise,
        ]);
    }
}
