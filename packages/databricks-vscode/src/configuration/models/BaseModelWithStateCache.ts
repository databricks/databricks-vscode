import {Disposable} from "vscode";
import {CachedValue} from "../../locking/CachedValue";
import {Mutex} from "../../locking";

export abstract class BaseModelWithStateCache<StateType extends object>
    implements Disposable
{
    protected disposables: Disposable[] = [];
    protected abstract mutex: Mutex;

    constructor() {
        this.disposables.push(this.stateCache);
    }

    protected readonly stateCache: CachedValue<StateType> = new CachedValue(
        this.readState.bind(this)
    );

    public onDidChange = this.stateCache.onDidChange.bind(this.stateCache);
    public onDidChangeKey = this.stateCache.onDidChangeKey.bind(
        this.stateCache
    );

    protected abstract readState(): Promise<StateType>;

    @Mutex.synchronise("mutex")
    public async get<T extends keyof StateType>(
        key: T
    ): Promise<StateType[T] | undefined> {
        return (await this.stateCache.value)[key];
    }

    @Mutex.synchronise("mutex")
    public async load<T extends keyof StateType>(
        keys: T[] = []
    ): Promise<Partial<Pick<StateType, T>>> {
        if (keys.length === 0) {
            return await this.stateCache.value;
        }

        const stateValue = await this.stateCache.value;
        return Object.fromEntries(
            Object.entries(stateValue).filter(([key]) => {
                return keys.includes(key as T);
            })
        ) as Partial<{
            [K in T]: StateType[K];
        }>;
    }

    public refresh() {
        this.stateCache.refresh();
    }

    public abstract resetCache(): void;
    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
