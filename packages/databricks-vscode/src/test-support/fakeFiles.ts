import path from "node:path";
import type { FileEvents } from "../platform/fileEvents";

/**
 * `FileEvents` that tests drive: `touch(file)` reports `file` to every
 * watcher whose base contains it. It doesn't match the globs; the code under
 * test re-reads what it watches anyway.
 */
export class FakeFileEvents implements FileEvents {
    readonly watchers = new Set<{
        base: string;
        pattern: string;
        onEvent: (file: string) => void;
    }>();

    watch(base: string, pattern: string, onEvent: (file: string) => void) {
        const watcher = { base: path.normalize(base), pattern, onEvent };
        this.watchers.add(watcher);
        return { dispose: () => this.watchers.delete(watcher) };
    }

    touch(file: string): void {
        const normalized = path.normalize(file);
        // A copy: a watcher may be disposed while the event is reported.
        for (const w of Array.from(this.watchers)) {
            if (!path.relative(w.base, normalized).startsWith("..")) {
                w.onEvent(normalized);
            }
        }
    }

    /** The bases and patterns being watched, for assertions. */
    watched(): string[] {
        return [...this.watchers].map((w) => `${w.base} ${w.pattern}`).sort();
    }
}
