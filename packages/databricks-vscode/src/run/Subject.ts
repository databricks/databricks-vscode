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
        await Promise.race([
            new Promise((_resolve, reject) =>
                setTimeout(() => {
                    reject(new Error("timeout"));
                }, timeout)
            ),
            this.promise,
        ]);
    }
}
