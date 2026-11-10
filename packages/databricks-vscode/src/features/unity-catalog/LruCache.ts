/**
 * A map that keeps at most `capacity` entries. Reading an entry makes it the
 * newest; adding one past the limit drops the oldest.
 */
export class LruCache<K, V> {
    private readonly entries = new Map<K, V>();

    constructor(readonly capacity: number) {
        if (capacity < 1) {
            throw new Error("An LRU cache needs room for one entry");
        }
    }

    get size(): number {
        return this.entries.size;
    }

    get(key: K): V | undefined {
        if (!this.entries.has(key)) {
            return undefined;
        }
        const value = this.entries.get(key)!;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    /** Without making the entry newer. */
    peek(key: K): V | undefined {
        return this.entries.get(key);
    }

    set(key: K, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, value);
        while (this.entries.size > this.capacity) {
            this.entries.delete(this.entries.keys().next().value!);
        }
    }

    delete(key: K): boolean {
        return this.entries.delete(key);
    }

    /** Drops every entry whose key matches. */
    deleteWhere(matches: (key: K) => boolean): void {
        for (const key of Array.from(this.entries.keys())) {
            if (matches(key)) {
                this.entries.delete(key);
            }
        }
    }

    clear(): void {
        this.entries.clear();
    }
}
