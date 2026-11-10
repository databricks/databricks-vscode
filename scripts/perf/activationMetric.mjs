// The ratchet's activation metric, `activation.extensionHostMs` (`yarn
// ratchet`, so `yarn check`): how long the user waits for the extension once
// VS Code starts activating it. It is the median, over 7 runs after a
// warm-up, of trace.mjs's activation scenario on the packaged VSIX (`yarn
// package`): in a window without a folder, once the host's own startup
// activations are over, the extension is activated through the API, and the
// time runs until its activate() has settled. That covers the extension's
// module load and activate(), with its extension pack's members installed,
// as users have them; VS Code doesn't start them with it.
//
// The activation budget (packages/databricks-vscode/src/test/budgets/activation.test.ts,
// `yarn test` only) times activate() alone, under plain Node, on any machine.
//
// A time compares only with one taken on the same setup, so the metric is
// measured only on the setup its baseline was: VS Code and the dependencies
// at the versions below, on a machine like the one below. PERF_VSCODE names
// the unpacked VS Code; the dependencies come from DATABRICKS_E2E_EXTENSIONS
// or ~/.vscode/extensions, as for trace.mjs. On another machine the ratchet
// notes that it isn't measured there and keeps the baseline. On this machine
// without the setup, it does the same, except in CI (CI=true), where it fails.
//
//   node scripts/perf/activationMetric.mjs   measures it as the ratchet does
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, metrics } from "./lib.mjs";
import { sourceExtensions, traceScenario } from "./trace.mjs";

export const ACTIVATION_METRIC = "activation.extensionHostMs";

/** What the baseline was measured on. Changing any of them changes the metric: measure it again. */
export const ACTIVATION_SETUP = {
    vscode: "1.140.0",
    dependencies: {
        "ms-python.debugpy": "2025.18.0",
        "ms-python.python": "2026.4.0",
        "ms-toolsai.jupyter": "2025.9.1",
        "redhat.vscode-yaml": "1.24.0",
    },
    machine: "Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz ×32",
};

const RUNS = 7;
const MEASURED = "trigger → activate() settled";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** This machine, in ACTIVATION_SETUP's terms. */
function machine() {
    return `${os.cpus()[0]?.model ?? "?"} ×${os.cpus().length}`;
}

/**
 * Why the metric can't be measured here, or undefined when it can:
 * `{elsewhere}` on another machine, `{missing}` when this one lacks the setup.
 */
export function setupGap({
    platform = process.platform,
    here = machine(),
    env = process.env,
    vscodeVersion,
    dependencies,
    required,
}) {
    if (platform !== "linux" || here !== ACTIVATION_SETUP.machine) {
        return {
            elsewhere: `its baseline is for ${ACTIVATION_SETUP.machine} on Linux, not ${here} on ${platform}`,
        };
    }
    if (vscodeVersion !== ACTIVATION_SETUP.vscode) {
        return {
            missing:
                vscodeVersion === undefined
                    ? `PERF_VSCODE doesn't name an unpacked VS Code ${ACTIVATION_SETUP.vscode}`
                    : `PERF_VSCODE is VS Code ${vscodeVersion}, not ${ACTIVATION_SETUP.vscode}`,
        };
    }
    for (const id of required) {
        const pinned = ACTIVATION_SETUP.dependencies[id];
        if (pinned === undefined) {
            return {
                missing: `${id} has no version in ACTIVATION_SETUP; measure with it and pin it`,
            };
        }
        if (dependencies.get(id) !== pinned) {
            return {
                missing: `${id} ${pinned} isn't in DATABRICKS_E2E_EXTENSIONS or ~/.vscode/extensions (found ${dependencies.get(id) ?? "none"})`,
            };
        }
    }
    if (!env.DISPLAY && !onPath("xvfb-run", env)) {
        return { missing: "there is no display, and no xvfb-run" };
    }
    return undefined;
}

function onPath(command, env) {
    return (env.PATH ?? "")
        .split(path.delimiter)
        .some((dir) => dir !== "" && fs.existsSync(path.join(dir, command)));
}

function vscodeVersionOf(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, "resources/app/package.json"), "utf-8"))
            .version;
    } catch {
        return undefined;
    }
}

/**
 * Measures the metric: `{value, details}`, or `{skipped}` with the reason it
 * isn't measured here, or `{problem}` when it should have been and wasn't.
 */
export async function measureActivation({ log = () => {} } = {}) {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(root, "packages/databricks-vscode/package.json"), "utf-8"),
    );
    const gap = setupGap({
        vscodeVersion: process.env.PERF_VSCODE
            ? vscodeVersionOf(process.env.PERF_VSCODE)
            : undefined,
        dependencies: new Map(
            [...sourceExtensions()].map(([id, { manifest: m }]) => [id, m.version]),
        ),
        required: (manifest.extensionPack ?? []).map((id) => id.toLowerCase()),
    });
    if (gap?.elsewhere !== undefined) {
        return { skipped: gap.elsewhere };
    }
    if (gap?.missing !== undefined) {
        return process.env.CI === "true"
            ? {
                  problem: `CI runs on the machine ${ACTIVATION_METRIC} is measured on, but ${gap.missing}.`,
              }
            : { skipped: gap.missing };
    }
    try {
        execFileSync("yarn", ["package"], { cwd: root, stdio: "pipe", encoding: "utf-8" });
    } catch (error) {
        return {
            problem: `\`yarn package\` failed, so ${ACTIVATION_METRIC} wasn't measured:\n${error.stderr || error.stdout || String(error)}`,
        };
    }
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-activation-"));
    try {
        const { summaries, problems } = await traceScenario({
            scenario: "activation",
            vscode: process.env.PERF_VSCODE,
            runs: RUNS,
            warmUp: 1,
            sandbox,
            fresh: false,
            cold: false,
            log,
        });
        const rows = aggregate(summaries.map(metrics));
        const row = rows.find((r) => r.name === MEASURED);
        if (problems.length > 0 || row?.n !== RUNS) {
            return {
                problem: `${ACTIVATION_METRIC} wasn't measured in ${RUNS} runs: ${problems.join("; ") || `${row?.n ?? 0} runs timed it`}`,
            };
        }
        const part = (name) => rows.find((r) => r.name === name)?.median?.toFixed(0) ?? "?";
        return {
            value: Math.round(row.median),
            details: [
                `median of ${RUNS} runs ${row.median.toFixed(1)} ms, p10–p90 ${row.p10.toFixed(1)}–${row.p90.toFixed(1)}`,
                `of which: before the module load ${part("trigger → extension load starts")} ms, the module load ${part("extension load")} ms, activate() ${part("activate()")} ms`,
            ],
        };
    } catch (error) {
        return { problem: `${ACTIVATION_METRIC} wasn't measured: ${String(error)}` };
    } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
    }
}

if (import.meta.main) {
    const result = await measureActivation({ log: console.log });
    console.log(JSON.stringify(result, undefined, 2));
    process.exitCode = "problem" in result ? 1 : 0;
}
