import {PythonSetupMode} from "../models/PythonSetupResult";

/**
 * A resolved `environments setup-local` invocation: the mode, the compute
 * target (cluster or serverless), and optional profile / dev-only
 * constraint-source override. This is the pure input to
 * {@link buildSetupLocalArgs}; the gateway turns the argv into a spawned
 * process.
 */
export interface SetupLocalInvocation {
    mode: PythonSetupMode;
    profile?: string;
    compute:
        | {kind: "cluster"; clusterId: string}
        | {kind: "serverless"; version: string};
    /**
     * Hidden `--constraint-source-url` override (dev/testing only). The
     * serverless version is passed verbatim as a bare number, e.g. "5" — the
     * CLI normalizes it to `vN` in its output.
     */
    constraintSourceUrl?: string;
}

/**
 * Build the argv for `databricks environments setup-local --output json`.
 * Deterministic and side-effect-free so it is trivially unit-testable; the
 * order is fixed (compute → mode → profile → source → output) for stable tests.
 */
export function buildSetupLocalArgs(inv: SetupLocalInvocation): string[] {
    const args = ["environments", "setup-local"];

    if (inv.compute.kind === "cluster") {
        args.push("--cluster-id", inv.compute.clusterId);
    } else {
        args.push("--serverless-version", inv.compute.version);
    }

    if (inv.mode === "constraints-only") {
        args.push("--constraints-only");
    }
    if (inv.profile) {
        args.push("--profile", inv.profile);
    }
    if (inv.constraintSourceUrl) {
        args.push("--constraint-source-url", inv.constraintSourceUrl);
    }

    // Always request the machine-readable result last.
    args.push("--output", "json");
    return args;
}

/**
 * Resolve which `databricks` binary to run: a non-empty override wins,
 * otherwise the bundled CLI path. The override exists only while the
 * `setup-local` command is not yet in the bundled CLI (see the
 * `databricks.experiments.cliPathOverride` setting); this function stays pure —
 * the config value is read by the caller and passed in.
 */
export function resolveCliPath(args: {
    override: string | undefined;
    bundled: string;
}): string {
    // The override comes from a VS Code setting, so it may be undefined when
    // unset — coalesce before trimming so this stays a total function.
    const override = (args.override ?? "").trim();
    return override.length > 0 ? override : args.bundled;
}
