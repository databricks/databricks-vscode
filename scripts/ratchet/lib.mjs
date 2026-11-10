// The ratchet's pure logic: the baseline file's format, the comparison of
// measured metrics with it, and the helpers that read oxlint's output and
// source text. `scripts/ratchet.mjs` does the I/O.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_FILE = "ratchet-baseline.json";

// Metrics whose names are open-ended: a name missing from the baseline has
// the value 0, so --update drops an entry that reaches 0 and refuses to add
// one above 0.
const ZERO_DEFAULT_PREFIXES = ["knip."];

const ENTRY_KEYS = ["direction", "lockIn", "tolerance", "value"];

/**
 * @typedef {{direction: "lower" | "higher", lockIn: boolean, tolerance: number | string, value: number}} Entry
 * @typedef {Entry & {hint?: string, details?: string[]}} Measurement
 * @typedef {"regressed" | "within-tolerance" | "unchanged" | "improved" | "improved-locked" | "new" | "unknown" | "unmeasured" | "skipped"} Status
 * @typedef {{name: string, status: Status, baseline?: Entry, current?: Measurement, reason?: string}} Result
 */

/** @param {string} name */
function isZeroDefault(name) {
    return ZERO_DEFAULT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Parses the baseline file. Returns the entries and every problem found.
 * @param {string} text
 * @returns {{metrics: Record<string, Entry>, errors: string[]}}
 */
export function parseBaseline(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        return { metrics: {}, errors: [`${BASELINE_FILE} is not valid JSON: ${String(error)}`] };
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return { metrics: {}, errors: [`${BASELINE_FILE} must hold one JSON object`] };
    }
    const metrics = {};
    const errors = [];
    for (const [name, entry] of Object.entries(raw)) {
        const problem = entryProblem(entry);
        if (problem) {
            errors.push(`${BASELINE_FILE}: "${name}" ${problem}`);
        } else {
            metrics[name] = entry;
        }
    }
    return { metrics, errors };
}

function entryProblem(entry) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return "must be an object";
    }
    const extra = Object.keys(entry).filter((key) => !ENTRY_KEYS.includes(key));
    if (extra.length > 0) {
        return `has unknown keys: ${extra.join(", ")}`;
    }
    if (entry.direction !== "lower" && entry.direction !== "higher") {
        return `needs "direction": "lower" or "higher"`;
    }
    if (typeof entry.lockIn !== "boolean") {
        return `needs "lockIn": true or false`;
    }
    if (parseTolerance(entry.tolerance) === undefined) {
        return `needs "tolerance": a number >= 0, or a percentage such as "2%"`;
    }
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
        return `needs a numeric "value"`;
    }
    return undefined;
}

/**
 * @param {unknown} tolerance a number (absolute) or a string such as "2%" (relative to the baseline value)
 * @returns {{absolute: number} | {percent: number} | undefined}
 */
function parseTolerance(tolerance) {
    if (typeof tolerance === "number") {
        return Number.isFinite(tolerance) && tolerance >= 0 ? { absolute: tolerance } : undefined;
    }
    if (typeof tolerance === "string") {
        const match = /^(\d+(?:\.\d+)?)%$/.exec(tolerance);
        return match ? { percent: Number(match[1]) } : undefined;
    }
    return undefined;
}

/**
 * How far past the baseline value a metric may go before it fails.
 * @param {Entry} entry
 */
export function slack(entry) {
    const tolerance = parseTolerance(entry.tolerance);
    if (tolerance === undefined) {
        return 0;
    }
    return "absolute" in tolerance
        ? tolerance.absolute
        : (Math.abs(entry.value) * tolerance.percent) / 100;
}

/**
 * The canonical form of the baseline: one metric per line, metric names and
 * entry keys sorted, so concurrent changes rarely conflict.
 * @param {Record<string, Entry>} metrics
 */
export function serializeBaseline(metrics) {
    const names = Object.keys(metrics).toSorted();
    const lines = names.map((name) => {
        const entry = metrics[name];
        const fields = ENTRY_KEYS.map(
            (key) => `${JSON.stringify(key)}: ${JSON.stringify(entry[key])}`,
        );
        return `  ${JSON.stringify(name)}: {${fields.join(", ")}}`;
    });
    return lines.length === 0 ? "{}\n" : `{\n${lines.join(",\n")}\n}\n`;
}

/**
 * Compares measured metrics with the baseline.
 * @param {Record<string, Entry>} baseline
 * @param {Record<string, Measurement>} current
 * @param {Set<string>} [unmeasured] baseline metrics this run couldn't measure (such as test counts when tests fail)
 * @param {Map<string, string>} [skipped] metrics this machine doesn't measure, with the reason (such as a timing baseline recorded on other hardware); their baseline stays
 * @returns {Result[]} one result per metric, sorted by name
 */
export function compare(baseline, current, unmeasured = new Set(), skipped = new Map()) {
    const names = [...new Set([...Object.keys(baseline), ...Object.keys(current)])].toSorted();
    return names.map((name) => {
        if (skipped.has(name)) {
            return { name, status: "skipped", baseline: baseline[name], reason: skipped.get(name) };
        }
        if (unmeasured.has(name)) {
            return { name, status: "unmeasured", baseline: baseline[name] };
        }
        let base = baseline[name];
        let now = current[name];
        if (now === undefined) {
            if (!isZeroDefault(name)) {
                return { name, status: "unknown", baseline: base };
            }
            now = { ...base, value: 0 };
        }
        if (base === undefined) {
            if (!isZeroDefault(name)) {
                return { name, status: "new", current: now };
            }
            base = {
                direction: now.direction,
                lockIn: now.lockIn,
                tolerance: now.tolerance,
                value: 0,
            };
        }
        return { name, status: statusOf(base, now.value), baseline: base, current: now };
    });
}

/**
 * @param {Entry} base
 * @param {number} value
 * @returns {Status}
 */
function statusOf(base, value) {
    const worseBy = base.direction === "lower" ? value - base.value : base.value - value;
    if (worseBy > slack(base)) {
        return "regressed";
    }
    if (worseBy > 0) {
        return "within-tolerance";
    }
    if (worseBy === 0) {
        return "unchanged";
    }
    return base.lockIn ? "improved-locked" : "improved";
}

/** @param {Result} result */
export function fails(result) {
    return (
        result.status === "regressed" ||
        result.status === "improved-locked" ||
        result.status === "new" ||
        result.status === "unknown"
    );
}

/**
 * The baseline --update writes: every improved metric moves to its current
 * value, and new metrics are recorded. Nothing gets worse: a metric that
 * regressed past its tolerance, or a baseline metric that is no longer
 * measured, makes the update refuse, and one within its tolerance, or one
 * this machine doesn't measure, keeps its baseline value.
 * @param {Record<string, Entry>} baseline
 * @param {Result[]} results
 * @returns {{metrics: Record<string, Entry>, changes: string[]} | {refused: string[]}}
 */
export function tighten(baseline, results) {
    const refused = results
        .filter(
            (result) =>
                result.status === "regressed" ||
                result.status === "unknown" ||
                result.status === "unmeasured",
        )
        .map((result) => result.name);
    if (refused.length > 0) {
        return { refused };
    }
    const metrics = { ...baseline };
    const changes = [];
    for (const { name, status, baseline: base, current: now } of results) {
        if (status === "improved" || status === "improved-locked") {
            if (isZeroDefault(name) && now.value === 0) {
                delete metrics[name];
                changes.push(`${name}: ${base.value} -> 0 (entry removed)`);
            } else {
                metrics[name] = { ...base, value: now.value };
                changes.push(`${name}: ${base.value} -> ${now.value}`);
            }
        } else if (status === "new") {
            metrics[name] = {
                direction: now.direction,
                lockIn: now.lockIn,
                tolerance: now.tolerance,
                value: now.value,
            };
            changes.push(`${name}: recorded at ${now.value}`);
        }
    }
    return { metrics, changes };
}

/**
 * A filename from `oxlint --format json`, relative to `root`, the directory
 * oxlint ran in. oxlint prints paths relative to it, except in a JetBrains
 * terminal (`TERMINAL_EMULATOR=JetBrains-JediTerm`), where it prints
 * `file://` URLs.
 * @param {string} filename
 * @param {string} root
 */
export function lintedPath(filename, root) {
    return filename.startsWith("file://") ? path.relative(root, fileURLToPath(filename)) : filename;
}

// `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line` and the
// oxlint- forms, in line or block comments.
const DISABLE_COMMENT = /(?:\/\/|\/\*+)\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?![\w-])/g;

// it.skip, describe.todo, test.skipIf(...), it.concurrent.runIf(...) and the
// like, and a test calling `ctx.skip()` or `context.skip()`.
const SKIP_OR_TODO =
    /\b(?:it|test|describe|suite)(?:\.(?:concurrent|sequential|only|fails|shuffle))*\.(?:skip|todo|skipIf|runIf)\b|\b(?:ctx|context)\.skip\(/g;

/** @param {string} text */
export function disableCommentLines(text) {
    return matchLines(text, DISABLE_COMMENT);
}

/** @param {string} text */
export function skipOrTodoLines(text) {
    return matchLines(text, SKIP_OR_TODO);
}

/**
 * The 1-based line of each match.
 * @param {string} text
 * @param {RegExp} pattern a global regular expression
 */
function matchLines(text, pattern) {
    const lines = [];
    let line = 1;
    let scanned = 0;
    for (const match of text.matchAll(pattern)) {
        for (
            let index = text.indexOf("\n", scanned);
            index !== -1 && index < match.index;
            index = text.indexOf("\n", index + 1)
        ) {
            line++;
        }
        scanned = match.index;
        lines.push(line);
    }
    return lines;
}
