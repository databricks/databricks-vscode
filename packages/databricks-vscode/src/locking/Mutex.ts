export class Mutex {
    private waitQueue: ((value?: any) => void)[] = [];
    private _locked = false;

    async wait() {
        if (this._locked) {
            await new Promise((resolve) => {
                this.waitQueue.push(resolve);
            });
        } else {
            this._locked = true;
        }
    }

    signal() {
        const resolveF = this.waitQueue.shift();
        if (resolveF) {
            resolveF();
        } else {
            this._locked = false;
        }
    }

    get locked() {
        return this._locked;
    }

    async synchronise(fn: () => Promise<void>) {
        await this.wait();
        try {
            await fn();
        } finally {
            this.signal();
        }
    }

    static synchronise(mutexKey: string) {
        return function (
            target: any,
            key: string,
            descriptor: PropertyDescriptor
        ) {
            const original = descriptor.value;
            descriptor.value = async function (...args: any[]) {
                const mutex = (this as any)[mutexKey] as Mutex;
                await mutex.wait();
                try {
                    return await original.apply(this, args);
                } finally {
                    mutex.signal();
                }
            };
        };
    }
}
