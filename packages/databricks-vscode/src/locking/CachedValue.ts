import {Disposable} from "vscode";
import {Mutex} from ".";
import lodash from "lodash";
import {EventEmitterWithErrorHandler} from "../utils/EventWithErrorHandler";

const customizer: lodash.IsEqualCustomizer = (value, other) => {
    if (value instanceof URL && other instanceof URL) {
        return value.toString() === other.toString();
    }
    return undefined;
};
export class CachedValue<T> implements Disposable {
    private disposables: Disposable[] = [];

    private _value: T | null = null;
    private _dirty = true;
    private readonly mutex = new Mutex();
    private readonly onDidChangeEmitter = new EventEmitterWithErrorHandler<{
        oldValue: T | null;
        newValue: T;
    }>({log: true, throw: false});
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
                        !lodash.isEqualWith(
                            oldValue?.[key],
                            newValue?.[key],
                            customizer
                        )
                    ) {
                        this.onDidChangeKeyEmitters.get(key)?.fire();
                    }
                }
            })
        );
    }

    get value(): Promise<T> {
        return this.mutex.synchronise(async () => {
            try {
                if (this._dirty || this._value === null) {
                    const newValue = await this.getter();
                    this.set(newValue);
                    return this._value as T;
                }
            } finally {
                this._dirty = false;
            }
            return this._value;
        });
    }

    set(value: T) {
        if (!lodash.isEqualWith(value, this._value, customizer)) {
            this.onDidChangeEmitter.fire({
                oldValue: this._value,
                newValue: value,
            });
            this._value = value;
        }
    }
    private readonly onDidChangeKeyEmitters = new Map<
        keyof T,
        EventEmitterWithErrorHandler<void>
    >();

    onDidChangeKey(key: T extends object ? keyof T : never) {
        if (!this.onDidChangeKeyEmitters.has(key)) {
            this.onDidChangeKeyEmitters.set(
                key,
                new EventEmitterWithErrorHandler({log: true, throw: false})
            );
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
