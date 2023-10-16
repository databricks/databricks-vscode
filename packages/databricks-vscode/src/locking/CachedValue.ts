import {Mutex} from ".";

export class CachedValue<T> {
    private _value: T | null = null;
    private _dirty = true;
    private mutex = new Mutex();

    constructor(private readonly getter: () => Promise<T>) {}

    get value(): Promise<T> {
        if (this._dirty || this._value === null) {
            return this.mutex
                .wait()
                .then(async () => {
                    this._value = await this.getter();
                    this._dirty = false;
                    return this._value;
                })
                .finally(() => {
                    this.mutex.signal();
                });
        }

        return Promise.resolve(this._value);
    }

    async invalidate() {
        await this.mutex.wait();
        this._dirty = true;
        this.mutex.signal();
    }
}
