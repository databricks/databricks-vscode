/**
 * A resolved `environments setup-local` invocation: the compute target (cluster
 * or serverless), which of the two behavioral steps to skip, and an optional
 * dev-only constraint-source override. This is the pure input to
 * {@link buildSetupLocalArgs}; the gateway turns the argv into a spawned process.
 *
 * There is deliberately no profile here: authentication reaches the CLI through
 * the spawned process's environment (see `CliWrapper.getSetupLocalEnvVars`),
 * matching how the bundle and ssh-connect flows forward it, so a `--profile`
 * flag would be a redundant second source of truth.
 */
export interface SetupLocalInvocation {
    /**
     * When true, pass `--dry-run`: the CLI resolves compute and reports the
     * environment key without provisioning or writing to disk. Used by drift
     * detection to read the authoritative `compute.envKey` for the selected
     * compute.
     */
    dryRun?: boolean;
    compute:
        | {kind: "cluster"; clusterId: string}
        | {kind: "serverless"; version: string};
    /**
     * When true, pass `--no-constraints`: don't write the remote Python-version
     * and dependency pins. Orthogonal to {@link skipDbconnect}.
     */
    skipConstraints?: boolean;
    /**
     * When true, pass `--no-dbconnect`: don't add the databricks-connect
     * dependency. The orthogonal replacement for the deprecated
     * `--constraints-only`. Orthogonal to {@link skipConstraints}.
     */
    skipDbconnect?: boolean;
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
 * order is fixed (compute → skip flags → dry-run → source → output) for stable
 * tests.
 */
export function buildSetupLocalArgs(inv: SetupLocalInvocation): string[] {
    const args = ["environments", "setup-local"];

    if (inv.compute.kind === "cluster") {
        args.push("--cluster-id", inv.compute.clusterId);
    } else {
        args.push("--serverless-version", inv.compute.version);
    }

    if (inv.skipConstraints) {
        args.push("--no-constraints");
    }
    if (inv.skipDbconnect) {
        args.push("--no-dbconnect");
    }
    if (inv.dryRun) {
        args.push("--dry-run");
    }
    if (inv.constraintSourceUrl) {
        args.push("--constraint-source-url", inv.constraintSourceUrl);
    }

    // Always request the machine-readable result last.
    args.push("--output", "json");
    return args;
}
