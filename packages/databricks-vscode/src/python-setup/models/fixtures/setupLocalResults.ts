/**
 * Golden `databricks environments setup-local --output json` results, mirrored
 * from the CLI's own acceptance suite
 * (databricks/cli `acceptance/localenv/<case>/output.txt`). These are the single
 * source of truth for the extension's result parser and consumers.
 *
 * They are typed as {@link PythonSetupResult} on purpose: the annotation couples
 * each fixture to the contract type, so any change to the type (a renamed field,
 * a tightened union) breaks this file at compile time — turning silent contract
 * drift into a build error. Parser tests that need raw CLI stdout wrap a fixture
 * in `JSON.stringify(...)`, which round-trips through `parsePythonSetupResult`.
 *
 * Source cases:
 *  - SUCCESS_DEFAULT          → acceptance/localenv/serverless-json
 *  - SUCCESS_CONSTRAINTS_ONLY → acceptance/localenv/constraints-only
 *  - ERROR_NO_TARGET          → acceptance/localenv/json-error
 *  - ERROR_USAGE              → acceptance/localenv/flag-conflict-json
 *
 * SUCCESS_REAL_RUN is synthesized (no committed CLI golden runs a real
 * provision — every acceptance case uses `--dry-run`). It follows
 * libs/localenv/result.go: `dryRun: false`, no `plan`, and the `venvPath` /
 * `backupPath` fields the extension's adopt-interpreter step consumes.
 */

import {PythonSetupResult} from "../PythonSetupResult";

/** serverless-json: default mode, --dry-run, --output json. */
export const SUCCESS_DEFAULT: PythonSetupResult = {
    schemaVersion: 1,
    command: "environments setup-local",
    ok: true,
    mode: "default",
    dryRun: true,
    target: {
        source: "serverless",
        serverlessVersion: "v4",
        envKey: "serverless/serverless-v4",
    },
    resolved: {
        pythonVersion: "3.12",
        dbconnectVersion: "17.2.0",
        artifactSource: "network",
    },
    greenfield: true,
    plan: {
        wouldWrite: "[TEST_TMP_DIR]/pyproject.toml",
        wouldInstallPython: "3.12",
        diff: "--- pyproject.toml\n+++ pyproject.toml\n",
    },
    phases: [
        {phase: "preflight", status: "ok"},
        {phase: "resolve", status: "ok"},
        {phase: "fetch", status: "ok"},
        {phase: "merge", status: "ok"},
        {phase: "provision", status: "ok"},
        {phase: "validate", status: "ok"},
    ],
    warnings: [],
    error: null,
    durationMs: 0,
};

/** constraints-only: note `resolved` omits `dbconnectVersion`. */
export const SUCCESS_CONSTRAINTS_ONLY: PythonSetupResult = {
    schemaVersion: 1,
    command: "environments setup-local",
    ok: true,
    mode: "constraints-only",
    dryRun: true,
    target: {
        source: "serverless",
        serverlessVersion: "v4",
        envKey: "serverless/serverless-v4",
    },
    resolved: {
        pythonVersion: "3.12",
        artifactSource: "network",
    },
    greenfield: true,
    plan: {
        wouldWrite: "[TEST_TMP_DIR]/pyproject.toml",
        wouldInstallPython: "3.12",
        diff: "--- pyproject.toml\n+++ pyproject.toml\n",
    },
    phases: [
        {phase: "preflight", status: "ok"},
        {phase: "resolve", status: "ok"},
        {phase: "fetch", status: "ok"},
        {phase: "merge", status: "ok"},
        {phase: "provision", status: "ok"},
        {phase: "validate", status: "ok"},
    ],
    warnings: [],
    error: null,
    durationMs: 0,
};

/** json-error: E_NO_TARGET at resolve; downstream phases `pending`. */
export const ERROR_NO_TARGET: PythonSetupResult = {
    schemaVersion: 1,
    command: "environments setup-local",
    ok: false,
    mode: "default",
    dryRun: false,
    greenfield: false,
    phases: [
        {phase: "preflight", status: "ok"},
        {phase: "resolve", status: "error"},
        {phase: "fetch", status: "pending"},
        {phase: "merge", status: "pending"},
        {phase: "provision", status: "pending"},
        {phase: "validate", status: "pending"},
    ],
    warnings: [],
    error: {
        code: "E_NO_TARGET",
        failurePhase: "resolve",
        message:
            "No compute target is selected. Select a cluster or serverless " +
            "target, or pass --cluster-id / --cluster-name / " +
            "--serverless-version / --job-id",
        diskMutated: false,
    },
    durationMs: 0,
};

/** flag-conflict-json: E_USAGE at preflight. */
export const ERROR_USAGE: PythonSetupResult = {
    schemaVersion: 1,
    command: "environments setup-local",
    ok: false,
    mode: "default",
    dryRun: false,
    greenfield: false,
    phases: [
        {phase: "preflight", status: "error"},
        {phase: "resolve", status: "pending"},
        {phase: "fetch", status: "pending"},
        {phase: "merge", status: "pending"},
        {phase: "provision", status: "pending"},
        {phase: "validate", status: "pending"},
    ],
    warnings: [],
    error: {
        code: "E_USAGE",
        failurePhase: "preflight",
        message:
            "invalid compute target flags: flags --cluster-id and " +
            "--serverless-version are mutually exclusive; specify at most one",
        diskMutated: false,
    },
    durationMs: 0,
};

/**
 * Synthesized real (non-dry-run) success: what the extension actually consumes
 * to adopt the interpreter. No committed CLI golden exercises a real provision.
 * Shape follows libs/localenv/result.go: `dryRun: false`, no `plan`, `venvPath`
 * and `backupPath` present.
 */
export const SUCCESS_REAL_RUN: PythonSetupResult = {
    schemaVersion: 1,
    command: "environments setup-local",
    ok: true,
    mode: "default",
    dryRun: false,
    target: {
        source: "serverless",
        serverlessVersion: "v4",
        envKey: "serverless/serverless-v4",
    },
    resolved: {
        pythonVersion: "3.12",
        dbconnectVersion: "17.2.0",
        artifactSource: "network",
    },
    greenfield: false,
    venvPath: "/home/user/project/.venv",
    backupPath: "/home/user/project/pyproject.toml.bak",
    phases: [
        {phase: "preflight", status: "ok"},
        {phase: "resolve", status: "ok"},
        {phase: "fetch", status: "ok"},
        {phase: "merge", status: "ok"},
        {phase: "provision", status: "ok"},
        {phase: "validate", status: "ok"},
    ],
    warnings: [],
    error: null,
    durationMs: 0,
};
