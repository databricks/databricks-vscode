import { afterEach, describe, expect, it, vi } from "vitest";
import { MutableState, Resource, select, when } from "./reactive";

describe("MutableState", () => {
    it("fires on change and not for an equal value", () => {
        const state = new MutableState({ a: 1 });
        const seen: unknown[] = [];
        state.onDidChange((v) => seen.push(v));
        state.set({ a: 1 });
        state.set({ a: 2 });
        expect(seen).toEqual([{ a: 2 }]);
        expect(state.value).toEqual({ a: 2 });
    });
});

describe("Resource", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts idle and loads only when invalidated", async () => {
        const load = vi.fn(async () => 1);
        const r = new Resource(load);
        expect(r.value).toEqual({ status: "idle" });
        expect(load).not.toHaveBeenCalled();
        r.invalidate("test");
        expect(await r.settled()).toEqual({ status: "ready", value: 1 });
    });

    it("coalesces invalidations inside the debounce window", async () => {
        vi.useFakeTimers();
        const load = vi.fn(async () => "v");
        const r = new Resource(load, { debounceMs: 100 });
        r.invalidate("a");
        r.invalidate("b");
        r.invalidate("c");
        await vi.advanceTimersByTimeAsync(150);
        expect(load).toHaveBeenCalledTimes(1);
        expect(r.value).toEqual({ status: "ready", value: "v" });
    });

    it("loads a first time at once on refresh, without the debounce window", async () => {
        vi.useFakeTimers();
        const load = vi.fn(async () => "v");
        const r = new Resource(load, { debounceMs: 200 });
        const refreshed = r.refresh("start");
        expect(load).toHaveBeenCalledTimes(1);
        expect(await refreshed).toEqual({ status: "ready", value: "v" });
    });

    it("loads at once on an explicit refresh, superseding the load a burst scheduled", async () => {
        vi.useFakeTimers();
        let n = 0;
        const load = vi.fn(async () => ++n);
        const r = new Resource(load, { debounceMs: 200 });
        r.invalidate("file event");
        r.invalidate("file event");
        const refreshed = r.refresh("sign-in wizard");
        expect(load).toHaveBeenCalledTimes(1);
        expect(await refreshed).toEqual({ status: "ready", value: 1 });
        await vi.advanceTimersByTimeAsync(250);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("still coalesces a burst of invalidations after a refresh", async () => {
        vi.useFakeTimers();
        let n = 0;
        const load = vi.fn(async () => ++n);
        const r = new Resource(load, { debounceMs: 200 });
        await r.refresh("start");
        for (let i = 0; i < 5; i++) {
            r.invalidate("file event");
            await vi.advanceTimersByTimeAsync(50);
        }
        expect(load).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(200);
        expect(load).toHaveBeenCalledTimes(2);
        expect(await r.settled()).toEqual({ status: "ready", value: 2 });
    });

    it("goes back to idle on reset, aborting a load in flight", async () => {
        const signals: AbortSignal[] = [];
        const r = new Resource<number>(async (signal) => {
            signals.push(signal);
            return 1;
        });
        r.invalidate("first");
        await r.settled();
        expect(r.latest).toBe(1);
        let release: (v: number) => void = () => {};
        const pending = new Resource<number>((signal) => {
            signals.push(signal);
            return new Promise((resolve) => (release = resolve));
        });
        pending.invalidate("a");
        const waiting = pending.settled();
        pending.reset();
        expect(signals.at(-1)!.aborted).toBe(true);
        expect(await waiting).toEqual({ status: "idle" });
        release(2);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(pending.value).toEqual({ status: "idle" });
        r.reset();
        expect(r.value).toEqual({ status: "idle" });
        expect(r.latest).toBeUndefined();
    });

    it("aborts a superseded load, and only the latest publishes", async () => {
        const signals: AbortSignal[] = [];
        const releases: ((v: number) => void)[] = [];
        const r = new Resource<number>(
            (signal) =>
                new Promise((resolve) => {
                    signals.push(signal);
                    releases.push(resolve);
                }),
        );
        r.invalidate("first");
        r.invalidate("second");
        expect(signals[0]!.aborted).toBe(true);
        expect(signals[1]!.aborted).toBe(false);
        releases[1]!(2);
        releases[0]!(1);
        expect(await r.settled()).toEqual({ status: "ready", value: 2 });
    });

    it("keeps the previous value while reloading and after an error", async () => {
        let n = 0;
        const r = new Resource(async () => {
            n++;
            if (n === 2) {
                throw new Error("boom");
            }
            return n;
        });
        r.invalidate("1");
        await r.settled();
        const states: string[] = [];
        r.onDidChange((s) => states.push(s.status));
        r.invalidate("2");
        expect(r.value).toEqual({ status: "loading", previous: 1 });
        const s = await r.settled();
        expect(s.status).toBe("error");
        expect(s.status === "error" && s.previous).toBe(1);
        expect(r.latest).toBe(1);
        expect(states).toEqual(["loading", "error"]);
    });

    it("settles immediately when nothing is pending", async () => {
        const r = new Resource(async () => 1);
        expect(await r.settled()).toEqual({ status: "idle" });
    });
});

describe("when", () => {
    it("resolves on the first matching value", async () => {
        const s = new MutableState(0);
        const p = when(s, (v) => v > 1);
        s.set(1);
        s.set(2);
        expect(await p).toBe(2);
    });

    it("rejects when aborted", async () => {
        const s = new MutableState(0);
        const c = new AbortController();
        const p = when(s, (v) => v > 1, c.signal);
        c.abort();
        await expect(p).rejects.toMatchObject({ name: "AbortError" });
    });
});

describe("select", () => {
    it("fires only when its part changes, and reads the source's current value", () => {
        const source = new MutableState({ a: 1, b: { c: 1 } });
        const a = select(source, (s) => s.a);
        const b = select(source, (s) => s.b);
        const seen: string[] = [];
        a.onDidChange((v) => seen.push(`a=${v} b.c=${b.value.c}`));
        b.onDidChange((v) => seen.push(`b.c=${v.c}`));
        source.set({ a: 1, b: { c: 2 } });
        // Both parts change at once: a listener of `a` already sees the new `b`.
        source.set({ a: 2, b: { c: 3 } });
        expect(seen).toEqual(["b.c=2", "a=2 b.c=3", "b.c=3"]);
        a.dispose();
        source.set({ a: 3, b: { c: 3 } });
        expect(seen).toHaveLength(3);
    });
});
