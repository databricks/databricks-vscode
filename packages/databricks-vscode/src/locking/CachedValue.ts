import {EventEmitter} from "vscode";
import {Mutex} from ".";
import lodash from "lodash";

export class CachedValue<T> {
    private _value: T | null = null;
    private _dirty = true;
    private readonly mutex = new Mutex();
    private readonly onDidChangeEmitter = new EventEmitter<{
        oldValue: T | null;
        newValue: T;
    }>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly getter: (value: T | null) => Promise<T>) {}

    get value(): Promise<T> {
        //TODO: Fire an event if the returned value and the cached value are different
        if (this._dirty || this._value === null) {
            return this.mutex
                .wait()
                .then(async () => {
                    const newValue = await this.getter(this._value);
                    if (!lodash.isEqual(newValue, this._value)) {
                        this.onDidChangeEmitter.fire({
                            oldValue: this._value,
                            newValue: newValue,
                        });
                    }
                    this._value = newValue;
                    this._dirty = false;
                    return this._value;
                })
                .finally(() => {
                    this.mutex.signal();
                });
        }

        return Promise.resolve(this._value);
    }

    @Mutex.synchronise("mutex")
    async invalidate() {
        this._dirty = true;
    }

    async refresh() {
        this.invalidate();
        await this.value;
    }
}
