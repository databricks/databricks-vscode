import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
    compare,
    disableCommentLines,
    fails,
    parseBaseline,
    serializeBaseline,
    skipOrTodoLines,
    slack,
    tighten,
    lintedPath,
} from "./lib.mjs";

const lower = (value, extra = {}) => ({
    direction: "lower",
    lockIn: true,
    tolerance: 0,
    value,
    ...extra,
});
const higher = (value, extra = {}) => ({
    direction: "higher",
    lockIn: false,
    tolerance: 0,
    value,
    ...extra,
});
// Built from parts, so this file holds no disable comments of its own.
const directive = (tool, suffix = "") => `${tool}-disable${suffix}`;
const statuses = (results) => Object.fromEntries(results.map((r) => [r.name, r.status]));

await test("compare", async (t) => {
    await t.test("fails a lower-is-better metric that rises, and passes one that holds", () => {
        const results = compare({ a: lower(5), b: lower(5) }, { a: lower(6), b: lower(5) });
        assert.deepEqual(statuses(results), { a: "regressed", b: "unchanged" });
        assert.deepEqual(results.map(fails), [true, false]);
    });

    await t.test("fails a higher-is-better metric that falls", () => {
        assert.equal(compare({ n: higher(100) }, { n: higher(99) })[0].status, "regressed");
    });

    await t.test("fails an improvement when lock-in is on, and only notes it when off", () => {
        const results = compare(
            { locked: lower(5), loose: higher(10) },
            { locked: lower(4), loose: higher(11) },
        );
        assert.deepEqual(statuses(results), { locked: "improved-locked", loose: "improved" });
        assert.deepEqual(results.map(fails), [true, false]);
    });

    await t.test("allows an absolute tolerance", () => {
        const base = { m: lower(10, { tolerance: 2 }) };
        assert.equal(compare(base, { m: lower(12) })[0].status, "within-tolerance");
        assert.equal(compare(base, { m: lower(13) })[0].status, "regressed");
    });

    await t.test("allows a percentage tolerance relative to the baseline value", () => {
        const base = { size: lower(1000, { tolerance: "2%", lockIn: false }) };
        assert.equal(compare(base, { size: lower(1020) })[0].status, "within-tolerance");
        assert.equal(compare(base, { size: lower(1021) })[0].status, "regressed");
        assert.equal(compare(base, { size: lower(900) })[0].status, "improved");
    });

    await t.test("takes direction and tolerance from the baseline, not the measurement", () => {
        assert.equal(
            compare({ m: lower(10, { tolerance: 5 }) }, { m: lower(14, { tolerance: 0 }) })[0]
                .status,
            "within-tolerance",
        );
    });

    await t.test(
        "treats a knip issue type missing from the baseline as 0, so new findings fail",
        () => {
            const [result] = compare({}, { "knip.exports": lower(1) });
            assert.equal(result.status, "regressed");
            assert.equal(result.baseline.value, 0);
        },
    );

    await t.test("treats a knip issue type missing from either side as 0", () => {
        assert.deepEqual(
            statuses(compare({ "knip.files": lower(1) }, { "knip.exports": lower(2) })),
            { "knip.exports": "regressed", "knip.files": "improved-locked" },
        );
    });

    await t.test("fails a fixed metric missing from either side", () => {
        assert.deepEqual(statuses(compare({ gone: lower(1) }, { fresh: lower(1) })), {
            fresh: "new",
            gone: "unknown",
        });
    });

    await t.test("doesn't judge an unmeasured metric", () => {
        const [result] = compare(
            { "tests.fastSuite.count": higher(10) },
            {},
            new Set(["tests.fastSuite.count"]),
        );
        assert.equal(result.status, "unmeasured");
        assert.equal(fails(result), false);
    });

    await t.test("doesn't judge a metric this machine doesn't measure, and says why", () => {
        const [result] = compare(
            { "activation.extensionHostMs": lower(860, { tolerance: "10%" }) },
            {},
            new Set(),
            new Map([["activation.extensionHostMs", "no VS Code 1.140.0"]]),
        );
        assert.equal(result.status, "skipped");
        assert.equal(result.reason, "no VS Code 1.140.0");
        assert.equal(fails(result), false);
    });
});

await test("tighten", async (t) => {
    await t.test("moves improved metrics to their current value, locked or not", () => {
        const base = { a: lower(5), n: higher(10), same: lower(1) };
        const outcome = tighten(
            base,
            compare(base, { a: lower(3), n: higher(12), same: lower(1) }),
        );
        assert.deepEqual(outcome.metrics, { a: lower(3), n: higher(12), same: lower(1) });
        assert.deepEqual(outcome.changes, ["a: 5 -> 3", "n: 10 -> 12"]);
    });

    await t.test("refuses to write when a metric regressed past its tolerance", () => {
        const base = { a: lower(5), b: lower(5) };
        assert.deepEqual(tighten(base, compare(base, { a: lower(6), b: lower(1) })), {
            refused: ["a"],
        });
    });

    await t.test("keeps the baseline value of a metric that is worse within its tolerance", () => {
        const base = { size: lower(1000, { tolerance: "2%" }) };
        assert.deepEqual(tighten(base, compare(base, { size: lower(1010) })), {
            metrics: base,
            changes: [],
        });
    });

    await t.test("refuses to drop a baseline metric that wasn't measured", () => {
        const base = { gone: lower(1), skipped: higher(5) };
        assert.deepEqual(tighten(base, compare(base, {}, new Set(["skipped"]))), {
            refused: ["gone", "skipped"],
        });
    });

    await t.test("keeps the baseline of a metric this machine doesn't measure", () => {
        const base = { a: lower(5), timing: lower(860, { lockIn: false, tolerance: "10%" }) };
        const outcome = tighten(
            base,
            compare(base, { a: lower(3) }, new Set(), new Map([["timing", "other hardware"]])),
        );
        assert.deepEqual(outcome.metrics, {
            a: lower(3),
            timing: lower(860, { lockIn: false, tolerance: "10%" }),
        });
    });

    await t.test("records new fixed metrics and drops knip issue types that reached 0", () => {
        const base = { "knip.files": lower(2) };
        const outcome = tighten(base, compare(base, { fresh: higher(7) }));
        assert.deepEqual(outcome.metrics, { fresh: higher(7) });
    });

    await t.test("refuses a knip issue type that is new to the baseline", () => {
        assert.deepEqual(tighten({}, compare({}, { "knip.files": lower(1) })), {
            refused: ["knip.files"],
        });
    });

    await t.test("keeps the baseline's direction, tolerance and lock-in when tightening", () => {
        const base = { m: lower(10, { tolerance: 3, lockIn: false }) };
        assert.deepEqual(
            tighten(base, compare(base, { m: lower(4, { tolerance: 0, lockIn: true }) })).metrics,
            { m: lower(4, { tolerance: 3, lockIn: false }) },
        );
    });
});

await test("the baseline file", async (t) => {
    await t.test("serializes one metric per line with names and keys sorted", () => {
        const text = serializeBaseline({
            b: { value: 1, tolerance: "2%", lockIn: false, direction: "lower" },
            a: higher(3),
        });
        assert.equal(
            text,
            [
                "{",
                `  "a": {"direction": "higher", "lockIn": false, "tolerance": 0, "value": 3},`,
                `  "b": {"direction": "lower", "lockIn": false, "tolerance": "2%", "value": 1}`,
                "}",
                "",
            ].join("\n"),
        );
        assert.deepEqual(parseBaseline(text), {
            metrics: {
                a: higher(3),
                b: { direction: "lower", lockIn: false, tolerance: "2%", value: 1 },
            },
            errors: [],
        });
    });

    await t.test("serializes an empty baseline", () => {
        assert.equal(serializeBaseline({}), "{}\n");
    });

    await t.test("reports malformed entries by name", () => {
        const { errors } = parseBaseline(
            JSON.stringify({
                a: { direction: "up", lockIn: true, tolerance: 0, value: 1 },
                b: { direction: "lower", lockIn: "yes", tolerance: 0, value: 1 },
                c: { direction: "lower", lockIn: true, tolerance: "2", value: 1 },
                d: { direction: "lower", lockIn: true, tolerance: 0, value: "1" },
                e: { direction: "lower", lockIn: true, tolerance: 0, value: 1, note: "x" },
            }),
        );
        assert.equal(errors.length, 5);
        assert.match(errors[0], /"a" needs "direction"/);
        assert.match(errors[4], /"e" has unknown keys: note/);
    });

    await t.test("reports invalid JSON", () => {
        assert.match(parseBaseline("{").errors[0], /not valid JSON/);
    });

    await t.test("computes slack from both kinds of tolerance", () => {
        assert.equal(slack(lower(10, { tolerance: 2 })), 2);
        assert.equal(slack(lower(5000, { tolerance: "2%" })), 100);
    });
});

await test("the counters", async (t) => {
    await t.test("reads oxlint's filenames as paths relative to where it ran, URLs too", () => {
        const root = path.resolve("/repo");
        assert.equal(lintedPath("packages/a.ts", root), "packages/a.ts");
        // A URL as oxlint writes it on this OS: on Windows with the drive (`file:///C:/repo/...`).
        const url = pathToFileURL(path.join(root, "packages", "a b.ts")).href;
        assert.match(url, /a%20b\.ts$/);
        assert.equal(lintedPath(url, root), path.join("packages", "a b.ts"));
    });

    await t.test("finds every form of eslint-disable and oxlint-disable comment", () => {
        const text = [
            `// ${directive("eslint", "-next-line")} no-console`,
            "const a = 1;",
            `/* ${directive("eslint")} @typescript-eslint/naming-convention */`,
            `foo(); // ${directive("oxlint", "-line")}`,
            `//${directive("oxlint")}`,
            `/** ${directive("eslint")} */`,
            `// ${directive("eslint").replace("disable", "enable")}`,
            `const s = "${directive("eslint")}";`,
        ].join("\n");
        assert.deepEqual(disableCommentLines(text), [1, 3, 4, 5, 6]);
    });

    await t.test("finds skipped, todo and conditional tests", () => {
        const text = [
            `it.skip("a", () => {});`,
            `describe.todo("b");`,
            `it.skipIf(process.platform === "win32")("c", () => {});`,
            `test.concurrent.runIf(x)("d", () => {});`,
            `it("e", (ctx) => { ctx.skip(); });`,
            `it("skips nothing", () => { options.skip = true; });`,
            `it.only("f", () => {});`,
        ].join("\n");
        assert.deepEqual(skipOrTodoLines(text), [1, 2, 3, 4, 5]);
    });
});
