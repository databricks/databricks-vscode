import { beforeEach, describe, expect, it } from "vitest";
import { host, QuickInputButtons } from "../../test-support/vscode";
import { MultiStepInput } from "./quickPick";

const base = { title: "T", step: 1, totalSteps: 2, placeholder: "p" };
const tick = () => new Promise((r) => setImmediate(r));
const last = () => host.quickInputs[host.quickInputs.length - 1]!;

describe("MultiStepInput", () => {
    beforeEach(() => host.reset());

    it("runs steps in order and disposes the last input", async () => {
        const picked: string[] = [];
        const run = MultiStepInput.run(async (input) => {
            picked.push(
                (await input.showQuickPick({ ...base, items: [{ label: "a" }, { label: "b" }] }))
                    .label,
            );
            return async (input2) => {
                picked.push(await input2.showInputBox({ ...base, step: 2 }));
            };
        });
        await tick();
        last().accept("b");
        await tick();
        last().type("name");
        last().accept();
        await run;
        expect(picked).toEqual(["b", "name"]);
        expect(last().disposed).toBe(true);
    });

    it("goes back a step on Back", async () => {
        let first = 0;
        const run = MultiStepInput.run(async (input) => {
            first++;
            await input.showQuickPick({ ...base, items: [{ label: "a" }] });
            return async (input2) => {
                await input2.showInputBox({ ...base, step: 2 });
            };
        });
        await tick();
        last().accept("a");
        await tick();
        expect(last().buttons).toContain(QuickInputButtons.Back);
        last().triggerButton(QuickInputButtons.Back);
        await tick();
        expect(first).toBe(2);
        last().accept("a");
        await tick();
        last().accept();
        await run;
    });

    it("throws CancelledError when the input is hidden", async () => {
        const run = MultiStepInput.run(async (input) => {
            await input.showQuickPick({ ...base, items: [{ label: "a" }] });
        });
        await tick();
        last().hide();
        await expect(run).rejects.toMatchObject({ name: "CancelledError" });
    });

    it("is busy while items load, and not after", async () => {
        let release!: (items: { label: string }[]) => void;
        const items = new Promise<{ label: string }[]>((r) => (release = r));
        let picked: string | undefined;
        const run = MultiStepInput.run(async (input) => {
            picked = (await input.showQuickPick({ ...base, items, activeItem: (all) => all[1] }))
                .label;
        });
        await tick();
        expect(last().busy).toBe(true);
        release([{ label: "a" }, { label: "b" }]);
        await tick();
        expect(last().busy).toBe(false);
        expect(last().activeItems.map((i) => i.label)).toEqual(["b"]);
        last().accept();
        await run;
        expect(picked).toBe("b");
    });

    it("shows its items while loading more, and keeps them when the loading fails", async () => {
        let fail!: (reason: unknown) => void;
        const loaded = new Promise<string[]>((_, reject) => (fail = reject));
        const run = MultiStepInput.run(async (input) => {
            await input.showQuickPick({
                ...base,
                items: [{ label: "a" }],
                loading: {
                    loaded,
                    withLoaded: (more) => [{ label: "a" }, ...more.map((l) => ({ label: l }))],
                },
            });
        });
        await tick();
        expect(last().busy).toBe(true);
        expect(last().items.map((i) => i.label)).toEqual(["a"]);
        fail(new Error("unavailable"));
        await tick();
        expect(last().busy).toBe(false);
        expect(last().items.map((i) => i.label)).toEqual(["a"]);
        expect(last().visible).toBe(true);
        last().accept();
        await run;
    });

    it("adds what loaded to the items, and picks no item when the user moved off the first", async () => {
        let release!: (labels: string[]) => void;
        const loaded = new Promise<string[]>((r) => (release = r));
        let picked: string | undefined;
        const run = MultiStepInput.run(async (input) => {
            picked = (
                await input.showQuickPick({
                    ...base,
                    items: [{ label: "a" }, { label: "c" }],
                    loading: {
                        loaded,
                        withLoaded: (more) => [
                            { label: "a" },
                            { label: "c" },
                            ...more.map((l) => ({ label: l })),
                        ],
                        pickIfUntouched: (more) => ({ label: more[0]! }),
                    },
                })
            ).label;
        });
        await tick();
        last().move("c");
        release(["b"]);
        await tick();
        expect(last().items.map((i) => i.label)).toEqual(["a", "c", "b"]);
        expect(last().visible).toBe(true);
        last().accept("b");
        await run;
        expect(picked).toBe("b");
    });

    describe("showQuickAutoComplete", () => {
        it("lists and focuses the active item first", async () => {
            const items = [{ label: "https://a" }, { label: "https://b" }];
            let value: string | undefined;
            const run = MultiStepInput.run(async (input) => {
                value = await input.showQuickAutoComplete({ ...base, items, activeItem: items[1] });
            });
            await tick();
            expect(last().items.map((i) => i.label)).toEqual(["https://b", "https://a"]);
            last().accept();
            await run;
            expect(value).toBe("https://b");
        });

        it("shows the items typed text names first, whatever their labels, and doesn't offer the text as a new item", async () => {
            const items = [{ label: "https://a" }, { label: "https://b" }];
            let value: string | undefined;
            const run = MultiStepInput.run(async (input) => {
                value = await input.showQuickAutoComplete({
                    ...base,
                    items,
                    matchesTyped: (typed) => ({ rows: typed === "dev" ? [items[1]!] : [] }),
                    validate: async () => "Not a host",
                });
            });
            await tick();
            last().type("dev");
            await tick();
            expect(
                last()
                    .shownItems()
                    .map((i) => i.label),
            ).toEqual(["https://b"]);
            expect(last().items.map((i) => i.label)).not.toContain("dev");
            expect(last().activeItems[0]?.label).toBe("https://b");
            last().accept();
            await run;
            expect(value).toBe("https://b");
        });

        it("matches labels ignoring case, so typed text that matches a label isn't offered as a new item", async () => {
            const run = MultiStepInput.run(async (input) => {
                await input.showQuickAutoComplete({
                    ...base,
                    items: [{ label: "https://a" }],
                    validate: async () => "Not a host",
                });
            });
            await tick();
            last().type("HTTPS://A");
            await tick();
            expect(
                last()
                    .shownItems()
                    .map((i) => i.label),
            ).toEqual(["https://a"]);
            expect(last().items.map((i) => i.label)).toEqual(["https://a"]);
            last().accept("https://a");
            await run;
        });

        it("offers typed text as item 0 and refuses it when invalid", async () => {
            let value: string | undefined;
            const run = MultiStepInput.run(async (input) => {
                value = await input.showQuickAutoComplete({
                    ...base,
                    items: [{ label: "https://a" }],
                    validate: async (v) =>
                        v.startsWith("http://") ? "Invalid protocol" : undefined,
                });
            });
            await tick();
            last().type("http://x");
            await tick();
            expect(last().items[0]).toMatchObject({
                label: "http://x",
                detail: "$(error) Invalid protocol",
            });
            last().accept("http://x");
            await tick();
            expect(value).toBeUndefined();
            last().type("https://custom");
            await tick();
            last().accept("https://custom");
            await run;
            expect(value).toBe("https://custom");
        });
    });

    it("keeps an input box open while its value is invalid", async () => {
        let value: string | undefined;
        const run = MultiStepInput.run(async (input) => {
            value = await input.showInputBox({
                ...base,
                validate: async (v) =>
                    v === ""
                        ? { message: "Profile name cannot be empty", type: "error" }
                        : undefined,
            });
        });
        await tick();
        last().accept();
        await tick();
        expect(value).toBeUndefined();
        expect(last().validationMessage).toMatchObject({ message: "Profile name cannot be empty" });
        last().type("dev");
        last().accept();
        await run;
        expect(value).toBe("dev");
    });
});
