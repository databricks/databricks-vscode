// `yarn ratchet`: measures quality metrics and compares them with
// ratchet-baseline.json. A metric may stay the same or improve, never get
// worse. It runs oxlint and the fast unit tests itself, so `yarn check` runs
// each once, and it fails when either does. knip and jscpd run beside them.
// Then, alone so that nothing slows it down, it times the extension's
// activation in VS Code, where it can (scripts/perf/activationMetric.mjs).
//
//   yarn ratchet            measure and compare
//   yarn ratchet --update   move the baseline to the current values; it
//                           refuses to write a value worse than the baseline
//   yarn ratchet --init     write the first baseline from the current values;
//                           refuses when ratchet-baseline.json exists
//
// Loosening a metric takes a hand edit of ratchet-baseline.json.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVATION_METRIC, measureActivation } from "./perf/activationMetric.mjs";
import {
    BASELINE_FILE,
    compare,
    disableCommentLines,
    fails,
    lintedPath,
    parseBaseline,
    serializeBaseline,
    skipOrTodoLines,
    tighten,
} from "./ratchet/lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "packages/databricks-vscode");
const baselinePath = path.join(root, BASELINE_FILE);
const updateCommand = "yarn ratchet --update";
const MAX_DETAILS = 15;

const args = process.argv.slice(2);
const update = args.includes("--update");
const init = args.includes("--init");
const unknownArgs = args.filter((arg) => arg !== "--update" && arg !== "--init");
if (unknownArgs.length > 0 || (update && init)) {
    console.error(
        `ratchet: unexpected arguments ${args.join(" ")}. Usage: yarn ratchet [--update | --init]`,
    );
    process.exit(2);
}
if (init && fs.existsSync(baselinePath)) {
    console.error(
        `ratchet --init: ${BASELINE_FILE} exists. Use \`${updateCommand}\` to tighten it, or edit it by hand to loosen it.`,
    );
    process.exit(1);
}

const started = Date.now();
const [lint, tests, knip, jscpd] = await Promise.all([
    runOxlint(),
    runFastTests(),
    runKnip(),
    runJscpd(),
]);
const changed = changedFiles();

/** @type {Record<string, import("./ratchet/lib.mjs").Measurement>} */
const current = {};
const unmeasured = new Set();
const problems = [...lint.problems, ...tests.problems, ...knip.problems, ...jscpd.problems];

for (const [type, findings] of knip.findings) {
    if (findings.length === 0) {
        continue;
    }
    current[`knip.${type}`] = {
        direction: "lower",
        lockIn: true,
        tolerance: 0,
        value: findings.length,
        hint: `Remove what knip reports as unused (\`yarn lint:unused\` lists it), or, for a false positive, teach knip.jsonc about the entry point or dependency.`,
        details: changedFirst(findings),
    };
}

if (jscpd.statistics === undefined) {
    unmeasured.add("jscpd.clones");
    unmeasured.add("jscpd.duplicatedLines");
} else {
    const hint =
        "Extract the new duplicated code into a shared function (`yarn lint:dupes` lists every clone).";
    current["jscpd.clones"] = {
        direction: "lower",
        lockIn: true,
        tolerance: 0,
        value: jscpd.statistics.clones,
        hint,
        details: changedFirst(jscpd.clones),
    };
    current["jscpd.duplicatedLines"] = {
        direction: "lower",
        lockIn: false,
        tolerance: 0,
        value: jscpd.statistics.duplicatedLines,
        hint,
        details: changedFirst(jscpd.clones),
    };
}

const lintedFiles = listLintedFiles();
const disables = scan(lintedFiles, disableCommentLines);
current["lint.disableComments"] = {
    direction: "lower",
    lockIn: true,
    tolerance: 0,
    value: disables.total,
    hint: "Remove the new eslint-disable or oxlint-disable comment and fix the warning it hides.",
    details: changedFirst(disables.locations),
};

// The files vitest.config.mts includes, both suites (`test` and `test:fast`).
const testFiles = lintedFiles.filter((file) =>
    /^packages\/databricks-vscode\/src\/.*\.test\.ts$/.test(file),
);
const skips = scan(testFiles, skipOrTodoLines);
current["tests.skipOrTodo"] = {
    direction: "lower",
    lockIn: true,
    tolerance: 0,
    value: skips.total,
    hint: "Remove the new .skip, .todo, .skipIf or .runIf (or ctx.skip()): make the test run everywhere, or delete it.",
    details: changedFirst(skips.locations),
};

if (tests.count === undefined) {
    unmeasured.add("tests.fastSuite.count");
} else {
    current["tests.fastSuite.count"] = {
        direction: "higher",
        lockIn: false,
        tolerance: 0,
        value: tests.count,
        hint: "Tests were removed from the fast suite (`yarn workspace databricks test:fast`). Restore them, or replace them with equivalent tests.",
    };
}

const dist = measureDist();
if (dist.problem) {
    problems.push(dist.problem);
    unmeasured.add("bundle.distJsBytes");
} else {
    current["bundle.distJsBytes"] = {
        direction: "lower",
        lockIn: false,
        tolerance: "2%",
        value: dist.bytes,
        hint: "The compiled extension (packages/databricks-vscode/dist, *.js) grew. Check for new dependencies inlined into sources or large generated code.",
        details: dist.largest,
    };
}

// After the tools above, which would slow it down.
const skipped = new Map();
const activation = await measureActivation();
if ("value" in activation) {
    current[ACTIVATION_METRIC] = {
        direction: "lower",
        lockIn: false,
        // Above the spread of a 7-run median on the setup scripts/perf/activationMetric.mjs describes, idle or under load.
        tolerance: "10%",
        value: activation.value,
        hint: "Activating the extension got slower. `node scripts/perf/trace.mjs --scenario activation --runs 20` shows which part: the dependencies, the module load or activate(). If the setup changed on purpose (VS Code, a dependency), set the value in ratchet-baseline.json by hand and say why.",
        details: activation.details,
    };
} else if ("skipped" in activation) {
    skipped.set(ACTIVATION_METRIC, activation.skipped);
} else {
    problems.push(activation.problem);
    unmeasured.add(ACTIVATION_METRIC);
}

let baselineText;
try {
    baselineText = fs.readFileSync(baselinePath, "utf8");
} catch {
    baselineText = undefined;
}
const parsed =
    baselineText === undefined
        ? {
              metrics: {},
              errors: init
                  ? []
                  : [`${BASELINE_FILE} is missing. Create it with \`yarn ratchet --init\`.`],
          }
        : parseBaseline(baselineText);
problems.push(...parsed.errors);
// --update rewrites the file in canonical form, so only the check reports this.
const notCanonical =
    baselineText !== undefined &&
    parsed.errors.length === 0 &&
    serializeBaseline(parsed.metrics) !== baselineText
        ? `${BASELINE_FILE} is not in its canonical form (one metric per line, names and keys sorted). Rewrite it with \`${updateCommand}\`, which tightens improved values and leaves the rest as they are.`
        : undefined;

const results = compare(parsed.metrics, current, unmeasured, skipped);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (init) {
    runInit();
} else if (update) {
    runUpdate();
} else {
    report();
}

function report() {
    const failures = results.filter(fails);
    for (const result of results) {
        printResult(result);
    }
    const all = notCanonical ? [...problems, notCanonical] : problems;
    for (const problem of all) {
        console.error(`\nFAIL  ${problem}`);
    }
    const count = failures.length + all.length;
    console.log(
        count === 0
            ? `\nratchet: ${results.length} metrics match ${BASELINE_FILE} (${seconds}s)`
            : `\nratchet: ${count} failure${count === 1 ? "" : "s"} against ${BASELINE_FILE} (${seconds}s)`,
    );
    process.exitCode = count === 0 ? 0 : 1;
}

/** @param {import("./ratchet/lib.mjs").Result} result */
function printResult({ name, status, baseline, current: now, reason }) {
    switch (status) {
        case "regressed":
            console.error(
                `\nFAIL  ${name} got worse: baseline ${baseline.value}, current ${now.value} (${baseline.direction} is better, tolerance ${baseline.tolerance}).`,
            );
            printDetails(now.details);
            console.error(`      Next step: ${now.hint}`);
            console.error(
                `      If the change is intended, set "value" of "${name}" to ${now.value} in ${BASELINE_FILE} by hand and say why in the pull request.`,
            );
            break;
        case "improved-locked":
            console.error(
                `\nFAIL  ${name} improved: baseline ${baseline.value}, current ${now.value}. Lock it in.`,
            );
            console.error(`      Next step: run \`${updateCommand}\` and commit ${BASELINE_FILE}.`);
            break;
        case "new":
            console.error(`\nFAIL  ${name} is not in ${BASELINE_FILE} (current ${now.value}).`);
            console.error(
                `      Next step: run \`${updateCommand}\` to record it, and commit ${BASELINE_FILE}.`,
            );
            break;
        case "unknown":
            console.error(
                `\nFAIL  ${name} is in ${BASELINE_FILE}, but the ratchet doesn't measure it.`,
            );
            console.error(`      Next step: remove "${name}" from ${BASELINE_FILE} by hand.`);
            break;
        case "improved":
            console.log(
                `note  ${name} improved: baseline ${baseline.value}, current ${now.value}. \`${updateCommand}\` records it (optional).`,
            );
            break;
        case "within-tolerance":
            console.log(
                `note  ${name} is worse than the baseline but within tolerance: baseline ${baseline.value}, current ${now.value} (tolerance ${baseline.tolerance}).`,
            );
            break;
        case "unmeasured":
            console.log(`note  ${name} was not measured this run (see the failures below).`);
            break;
        case "skipped":
            console.log(`note  ${name} is not measured here: ${reason}. Its baseline stays.`);
            break;
        case "unchanged":
            break;
    }
}

/** @param {string[] | undefined} details */
function printDetails(details) {
    if (!details || details.length === 0) {
        return;
    }
    for (const line of details.slice(0, MAX_DETAILS)) {
        console.error(`        ${line}`);
    }
    if (details.length > MAX_DETAILS) {
        console.error(`        ... and ${details.length - MAX_DETAILS} more`);
    }
}

function runUpdate() {
    if (problems.length > 0) {
        for (const problem of problems) {
            console.error(`FAIL  ${problem}`);
        }
        console.error(
            `\nratchet --update: not writing ${BASELINE_FILE}; fix the failures above first.`,
        );
        process.exitCode = 1;
        return;
    }
    const outcome = tighten(parsed.metrics, results);
    if ("refused" in outcome) {
        for (const result of results.filter((r) => outcome.refused.includes(r.name))) {
            printResult(result);
        }
        console.error(
            `\nratchet --update: refusing to write ${BASELINE_FILE}: ${outcome.refused.join(", ")} would get worse or go unmeasured. Fix them, or edit ${BASELINE_FILE} by hand.`,
        );
        process.exitCode = 1;
        return;
    }
    for (const result of results.filter((r) => r.status === "within-tolerance")) {
        console.log(
            `keep  ${result.name} at ${result.baseline.value}: current ${result.current.value} is worse, and --update never loosens.`,
        );
    }
    const text = serializeBaseline(outcome.metrics);
    if (text === baselineText) {
        console.log(`ratchet --update: ${BASELINE_FILE} is already current (${seconds}s).`);
        return;
    }
    fs.writeFileSync(baselinePath, text, "utf8");
    for (const change of outcome.changes) {
        console.log(`tighten  ${change}`);
    }
    console.log(`ratchet --update: wrote ${BASELINE_FILE} (${seconds}s). Commit it.`);
}

function runInit() {
    if (problems.length > 0 || unmeasured.size > 0) {
        for (const problem of problems) {
            console.error(`FAIL  ${problem}`);
        }
        console.error(
            `\nratchet --init: not writing ${BASELINE_FILE}; fix the failures above first.`,
        );
        process.exitCode = 1;
        return;
    }
    const metrics = Object.fromEntries(
        Object.entries(current).map(([name, { direction, lockIn, tolerance, value }]) => [
            name,
            { direction, lockIn, tolerance, value },
        ]),
    );
    fs.writeFileSync(baselinePath, serializeBaseline(metrics), "utf8");
    console.log(
        `ratchet --init: wrote ${BASELINE_FILE} with ${Object.keys(metrics).length} metrics (${seconds}s). Commit it.`,
    );
}

/**
 * Runs oxlint as `yarn lint` does, with JSON output. Errors and warnings are
 * printed and fail the run, as `yarn lint` (`--deny-warnings`) does: no
 * warning is tracked as debt.
 */
async function runOxlint() {
    const { code, stdout, stderr } = await run("oxlint", ["--format", "json"], { capture: true });
    let diagnostics;
    try {
        diagnostics = JSON.parse(stdout).diagnostics.map((d) => ({
            ...d,
            filename: lintedPath(d.filename, root),
        }));
    } catch {
        return {
            problems: [`oxlint did not produce JSON (exit code ${code}):\n${stderr || stdout}`],
        };
    }
    for (const diagnostic of diagnostics) {
        const span = diagnostic.labels?.[0]?.span;
        const where = span
            ? `${diagnostic.filename}:${span.line}:${span.column}`
            : diagnostic.filename;
        console.error(
            `${where}: ${diagnostic.severity} ${diagnostic.code ?? ""}: ${diagnostic.message}`,
        );
    }
    const counts = ["error", "warning"]
        .map((severity) => [severity, diagnostics.filter((d) => d.severity === severity).length])
        .filter(([, count]) => count > 0)
        .map(([severity, count]) => `${count} ${severity}${count === 1 ? "" : "s"}`);
    if (counts.length > 0) {
        return {
            problems: [
                `oxlint reported ${counts.join(" and ")} (listed above; \`yarn lint\` shows them in full). Fix them.`,
            ],
        };
    }
    return { problems: code === 0 ? [] : [`oxlint exited with code ${code}:\n${stderr}`] };
}

/** Runs `test:fast` as `yarn check` did, adding a JSON report to count the tests. */
async function runFastTests() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-"));
    const reportFile = path.join(dir, "vitest.json");
    try {
        const { code } = await run("yarn", [
            "workspace",
            "databricks",
            "test:fast",
            "--reporter=default",
            "--reporter=json",
            `--outputFile.json=${reportFile}`,
        ]);
        if (code !== 0) {
            return {
                count: undefined,
                problems: [
                    `The fast unit tests failed (exit code ${code}; output above). Fix them.`,
                ],
            };
        }
        const vitestReport = JSON.parse(fs.readFileSync(reportFile, "utf8"));
        return { count: vitestReport.numTotalTests, problems: [] };
    } catch (error) {
        return {
            count: undefined,
            problems: [`Couldn't read the fast suite's test report: ${String(error)}`],
        };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Runs knip with knip.jsonc, as `yarn lint:unused` does. Each issue type
 * (unused files, exports, dependencies, ...) becomes a metric.
 */
async function runKnip() {
    const { code, stdout, stderr } = await run(
        "knip",
        ["--no-progress", "--no-exit-code", "--reporter", "json"],
        { capture: true },
    );
    let issues;
    try {
        issues = JSON.parse(stdout).issues;
    } catch {
        return {
            findings: new Map(),
            problems: [`knip did not produce JSON (exit code ${code}):\n${stderr || stdout}`],
        };
    }
    const findings = new Map();
    for (const issue of issues) {
        for (const [type, items] of Object.entries(issue)) {
            if (!Array.isArray(items)) {
                continue;
            }
            const list = findings.get(type) ?? [];
            for (const item of items) {
                list.push(
                    item.line === undefined
                        ? `${issue.file}: ${item.name}`
                        : `${issue.file}:${item.line}: ${item.name}`,
                );
            }
            findings.set(type, list);
        }
    }
    return { findings, problems: [] };
}

/**
 * Runs jscpd with .jscpd.json, as `yarn lint:dupes` does, writing its JSON
 * report to a temporary directory.
 */
async function runJscpd() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-jscpd-"));
    try {
        const { code, stderr } = await run(
            "jscpd",
            ["--silent", "--reporters", "json", "--output", dir],
            { capture: true },
        );
        if (code !== 0) {
            return {
                statistics: undefined,
                clones: [],
                problems: [`jscpd exited with code ${code}:\n${stderr}`],
            };
        }
        const jscpdReport = JSON.parse(
            fs.readFileSync(path.join(dir, "jscpd-report.json"), "utf8"),
        );
        const clones = jscpdReport.duplicates
            .toSorted((a, b) => b.lines - a.lines)
            .map(
                ({ lines, firstFile: a, secondFile: b }) =>
                    `${a.name}:${a.start}-${a.end} <-> ${b.name}:${b.start}-${b.end} (${lines} lines)`,
            );
        return { statistics: jscpdReport.statistics.total, clones, problems: [] };
    } catch (error) {
        return {
            statistics: undefined,
            clones: [],
            problems: [`Couldn't read jscpd's report: ${String(error)}`],
        };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * @param {string} command
 * @param {string[]} commandArgs
 * @param {{capture?: boolean}} [options]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function run(command, commandArgs, { capture = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, {
            cwd: root,
            stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
        });
        const out = [];
        const err = [];
        child.stdout?.on("data", (chunk) => out.push(chunk));
        child.stderr?.on("data", (chunk) => err.push(chunk));
        child.on("error", (error) =>
            reject(
                new Error(
                    `Couldn't run ${command} (run the ratchet with \`yarn ratchet\`): ${error.message}`,
                ),
            ),
        );
        child.on("close", (code) =>
            resolve({
                code: code ?? 1,
                stdout: Buffer.concat(out).toString("utf8"),
                stderr: Buffer.concat(err).toString("utf8"),
            }),
        );
    });
}

/**
 * The files oxlint lints: tracked and untracked files git doesn't ignore,
 * with JavaScript or TypeScript extensions, outside hidden directories.
 */
function listLintedFiles() {
    const output = execFileSync(
        "git",
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return output
        .split("\0")
        .filter(
            (file) =>
                /\.[cm]?[jt]sx?$/.test(file) &&
                !file.split("/").some((part) => part.startsWith(".")) &&
                fs.existsSync(path.join(root, file)),
        )
        .toSorted();
}

/**
 * @param {string[]} files repository-relative paths
 * @param {(text: string) => number[]} lines the lines of each match
 */
function scan(files, lines) {
    let total = 0;
    const locations = [];
    for (const file of files) {
        for (const line of lines(fs.readFileSync(path.join(root, file), "utf8"))) {
            total++;
            locations.push(`${file}:${line}`);
        }
    }
    return { total, locations };
}

/**
 * The files this change touches: uncommitted and untracked files, and the
 * commits since the merge base with RATCHET_BASE, or with the pull
 * request's base branch in GitHub Actions. Best effort: git errors leave
 * the set smaller.
 */
function changedFiles() {
    const base =
        process.env.RATCHET_BASE ??
        (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
    const queries = [
        ["diff", "--name-only", "HEAD"],
        ["ls-files", "--others", "--exclude-standard"],
        ...(base ? [["diff", "--name-only", `${base}...HEAD`]] : []),
    ];
    const files = new Set();
    for (const query of queries) {
        try {
            const output = execFileSync("git", query, {
                cwd: root,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            });
            for (const file of output.split("\n").filter(Boolean)) {
                files.add(file);
            }
        } catch {
            // Best effort.
        }
    }
    return files;
}

/**
 * Puts the details that name a changed file first, marked, since a new
 * problem is most likely there.
 * @param {string[]} details lines that start with a repository-relative path
 */
function changedFirst(details) {
    const changedLines = [];
    const otherLines = [];
    for (const line of details) {
        if (changed.has(line.split(":")[0])) {
            changedLines.push(`changed: ${line}`);
        } else {
            otherLines.push(line);
        }
    }
    return [...changedLines, ...otherLines];
}

/**
 * Bytes of the compiled extension: the *.js files in dist/ that have a
 * source in src/ (tsc -b leaves the output of deleted sources behind).
 */
function measureDist() {
    const distDir = path.join(extensionDir, "dist");
    if (!fs.existsSync(path.join(distDir, "extension.js"))) {
        return {
            problem:
                "packages/databricks-vscode/dist/extension.js is missing, so the bundle size can't be measured. Run `yarn build` first.",
        };
    }
    let bytes = 0;
    const sizes = [];
    for (const entry of fs.readdirSync(distDir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".js")) {
            continue;
        }
        const file = path.join(entry.parentPath, entry.name);
        const relative = path.relative(distDir, file);
        if (!fs.existsSync(path.join(extensionDir, "src", relative.replace(/\.js$/, ".ts")))) {
            continue;
        }
        const size = fs.statSync(file).size;
        bytes += size;
        sizes.push([relative, size]);
    }
    const largest = sizes
        .toSorted(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([file, size]) => `largest: dist/${file}: ${size} bytes`);
    return { bytes, largest };
}
