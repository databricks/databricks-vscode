import {EventEmitter, Disposable} from "vscode";
import {Mutex} from ".";
import lodash from "lodash";

export class CachedValue<T> implements Disposable {
    private disposables: Disposable[] = [];

    private _value: T | null = null;
    private _dirty = true;
    private readonly mutex = new Mutex();
    private readonly onDidChangeEmitter = new EventEmitter<{
        oldValue: T | null;
        newValue: T;
    }>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly getter: () => Promise<T>) {
        this.disposables.push(
            this.onDidChange(async ({oldValue, newValue}) => {
                function isObject(
                    value: unknown
                ): value is object | undefined | null {
                    return (
                        typeof value === "object" ||
                        typeof value === "undefined" ||
                        value === null
                    );
                }
                if (!isObject(oldValue) || !isObject(newValue)) {
                    return;
                }

                if (oldValue === null || oldValue === undefined) {
                    oldValue = {} as T;
                }
                if (newValue === null || newValue === undefined) {
                    newValue = {} as T;
                }

                for (const key of Object.keys({
                    ...oldValue,
                    ...newValue,
                } as any) as (keyof T)[]) {
                    if (
                        oldValue === null ||
                        !lodash.isEqual(oldValue?.[key], newValue?.[key])
                    ) {
                        this.onDidChangeKeyEmitters.get(key)?.fire();
                    }
                }
            })
        );
    }

    get value(): Promise<T> {
        return this.mutex.synchronise(async () => {
            if (this._dirty || this._value === null) {
                const newValue = await this.getter();
                if (!lodash.isEqual(newValue, this._value)) {
                    this.onDidChangeEmitter.fire({
                        oldValue: this._value,
                        newValue: newValue,
                    });
                }
                this._value = newValue;
                this._dirty = false;
                return this._value;
            }
            return this._value;
        });
    }

    private readonly onDidChangeKeyEmitters = new Map<
        keyof T,
        EventEmitter<void>
    >();

    onDidChangeKey(key: T extends object ? keyof T : never) {
        if (!this.onDidChangeKeyEmitters.has(key)) {
            this.onDidChangeKeyEmitters.set(key, new EventEmitter());
        }
        return this.onDidChangeKeyEmitters.get(key)!.event;
    }

    invalidate() {
        this._dirty = true;
    }

    async refresh() {
        this.invalidate();
        try {
            await this.value;
        } finally {
            this._dirty = false;
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
