/** Resolves `wait` once `notify` is called, or rejects after a timeout (the old `run/Subject.ts`). */
export class Subject {
    private resolve!: () => void;
    private readonly promise: Promise<void>;

    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    notify(): void {
        this.resolve();
    }

    async wait(timeout = 0): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        try {
            await Promise.race([
                new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error("timeout")), timeout);
                }),
                this.promise,
            ]);
        } finally {
            clearTimeout(timer);
        }
    }
}
