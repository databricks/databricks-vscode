import { z } from "zod";
import { CliError, type Cli, type CliCallContext } from "../Cli";

/*
 * `bundle validate`, `bundle summary`, `bundle deploy`, `bundle destroy`,
 * `bundle run` and a one-off `bundle sync`. The schemas name
 * only what the extension reads and keep everything else (`looseObject`), so
 * a newer CLI that adds fields still parses. Golden fixtures from CLI 1.19.0
 * in `fixtures/bundle/` pin them.
 */

const variable = z.looseObject({
    description: z.string().optional(),
    type: z.string().optional(),
    default: z.unknown().optional(),
    /** The resolved value for the target. */
    value: z.unknown().optional(),
    lookup: z.record(z.string(), z.unknown()).optional(),
});

/** One resource of any type: `resources.<type>.<key>`. */
const resource = z.looseObject({
    name: z.string().optional(),
    /** Set by `summary` once the resource is deployed. */
    id: z.string().optional(),
    /** Set by `summary`: how the local config differs from the deployment. */
    modified_status: z.enum(["created", "updated", "deleted"]).optional(),
    url: z.string().optional(),
});

const resources = z.record(z.string(), z.record(z.string(), resource));

const bundleConfig = z.looseObject({
    bundle: z
        .looseObject({
            name: z.string().optional(),
            target: z.string().optional(),
            mode: z.string().optional(),
            cluster_id: z.string().optional(),
            compute_id: z.string().optional(),
        })
        .optional(),
    workspace: z
        .looseObject({
            host: z.string().optional(),
            profile: z.string().optional(),
            root_path: z.string().optional(),
            file_path: z.string().optional(),
        })
        .optional(),
    variables: z.record(z.string(), variable).optional(),
    resources: resources.optional(),
});

/** The resolved configuration that `bundle validate` prints for a target. */
export const validateOutput = bundleConfig;
export type ValidateOutput = z.infer<typeof validateOutput>;
export type BundleVariable = z.infer<typeof variable>;
export type BundleResource = z.infer<typeof resource>;
export type BundleResourceModifiedStatus = NonNullable<BundleResource["modified_status"]>;

/** Where each config path is declared: indices into `files`, then line and column, both 1-based. */
const locations = z.object({
    version: z.number(),
    files: z.array(z.string()),
    locations: z.record(z.string(), z.array(z.array(z.number()))),
});
export type BundleLocations = z.infer<typeof locations>;

/** `bundle summary --include-locations`: the config with the deployed state merged in. */
export const summaryOutput = bundleConfig.extend({ __locations: locations.optional() });
export type SummaryOutput = z.infer<typeof summaryOutput>;

/** stderr says a required variable has no value. */
export class MissingVariableError extends Error {
    constructor(readonly cliError: CliError) {
        super(cliError.message, { cause: cliError });
        this.name = "MissingVariableError";
    }
}

const MISSING_VARIABLE = /no value assigned to required variable/i;

export function validateArgs(target: string): string[] {
    return ["bundle", "validate", "--target", target, "--output", "json"];
}

/**
 * `--force-pull` downloads the remote state even when a local copy exists.
 * Only an explicit refresh asks for it.
 */
export function summaryArgs(target: string, options: { forcePull?: boolean } = {}): string[] {
    return [
        "bundle",
        "summary",
        "--target",
        target,
        "--include-locations",
        "--output",
        "json",
        ...(options.forcePull ? ["--force-pull"] : []),
    ];
}

/** Runs `bundle validate`. Throws `MissingVariableError`, `CliError` or `CancelledError`. */
export async function bundleValidate(
    cli: Cli,
    target: string,
    ctx: CliCallContext,
): Promise<ValidateOutput> {
    return parseJson(
        validateOutput,
        (await run(cli, validateArgs(target), ctx)).stdout,
        "bundle validate",
    );
}

/** Runs `bundle summary`. An empty output means nothing is configured. */
export async function bundleSummary(
    cli: Cli,
    target: string,
    ctx: CliCallContext,
    options: { forcePull?: boolean } = {},
): Promise<SummaryOutput> {
    const { stdout } = await run(cli, summaryArgs(target, options), ctx);
    return stdout.trim() === "" ? {} : parseJson(summaryOutput, stdout, "bundle summary");
}

/** `--force-lock --force` takes over another deployment's lock and skips the Git branch check. */
export function deployArgs(target: string, options: { force?: boolean } = {}): string[] {
    return [
        "bundle",
        "deploy",
        "--target",
        target,
        "--verbose",
        ...(options.force ? ["--force-lock", "--force"] : []),
    ];
}

/** `--auto-approve`: there is no terminal to answer the CLI's prompt; the command asked first. */
export function destroyArgs(target: string, options: { force?: boolean } = {}): string[] {
    return [
        "bundle",
        "destroy",
        "--target",
        target,
        "--auto-approve",
        ...(options.force ? ["--force-lock"] : []),
    ];
}

/**
 * Runs `bundle deploy`. Its output is a log, not a result: callers stream it
 * through `onStdout` and `onStderr`. Throws `MissingVariableError`,
 * `CliError` or `CancelledError`.
 */
export async function bundleDeploy(
    cli: Cli,
    target: string,
    ctx: CliCallContext,
    options: { force?: boolean } = {},
): Promise<void> {
    await run(cli, deployArgs(target, options), ctx);
}

/** Runs `bundle destroy`, like `bundleDeploy`. */
export async function bundleDestroy(
    cli: Cli,
    target: string,
    ctx: CliCallContext,
    options: { force?: boolean } = {},
): Promise<void> {
    await run(cli, destroyArgs(target, options), ctx);
}

/**
 * One `bundle sync`, without `--watch`: uploads the bundle's files once, for
 * "Upload and Run File" and "Run File as Workflow" (RUN-01). `--output text`,
 * as before; the output is a log.
 */
function syncOnceArgs(target: string): string[] {
    return ["bundle", "sync", "--target", target, "--output", "text"];
}

/** Runs `bundle sync` once, like `bundleDeploy`. */
export async function bundleSyncOnce(cli: Cli, target: string, ctx: CliCallContext): Promise<void> {
    await run(cli, syncOnceArgs(target), ctx);
}

/** How `bundle run` runs a pipeline: the whole graph, a validation, or some tables. */
export interface BundleRunOptions {
    /** `--validate-only`: checks the graph without updating tables. */
    readonly validateOnly?: boolean;
    /** `--refresh`: updates only these tables. */
    readonly refresh?: readonly string[];
    /** `--full-refresh`: resets and recomputes these tables. */
    readonly fullRefresh?: readonly string[];
    /** Passed through after the key, as typed into "Deploy the bundle and run a resource". */
    readonly extraArgs?: readonly string[];
}

/** `resourceKey` is `<type>.<key>`, such as `jobs.my_job`, which the CLI accepts as is. */
export function runArgs(
    target: string,
    resourceKey: string,
    options: BundleRunOptions = {},
): string[] {
    return [
        "bundle",
        "run",
        "--target",
        target,
        resourceKey,
        ...(options.validateOnly ? ["--validate-only"] : []),
        ...(options.refresh?.length ? ["--refresh", options.refresh.join(",")] : []),
        ...(options.fullRefresh?.length ? ["--full-refresh", options.fullRefresh.join(",")] : []),
        ...(options.extraArgs ?? []),
    ];
}

/**
 * Runs `bundle run`, which starts a job run or a pipeline update and waits
 * for it. Its output is for a human: callers stream it to a terminal and
 * read the run's ID from it (`parseJobRunId`, `parsePipelineUpdateId`).
 * Throws `MissingVariableError`, `CliError` or `CancelledError`.
 */
export async function bundleRun(
    cli: Cli,
    target: string,
    resourceKey: string,
    ctx: CliCallContext,
    options: BundleRunOptions = {},
): Promise<void> {
    await run(cli, runArgs(target, resourceKey, options), ctx);
}

/**
 * The run ID in the run URL that `bundle run` prints for a job. CLI 1.5 and
 * later print `/jobs/<id>/runs/<id>?o=…`, older ones `#job/<id>/run/<id>`;
 * `runs?` matches both. `\d+` needs a digit, so output that ends right after
 * `/runs/` gives nothing rather than an empty ID.
 */
export function parseJobRunId(output: string): string | undefined {
    return /\/runs?\/(\d+)/.exec(output)?.[1];
}

/** The update ID in the "Update URL: …/#joblist/pipelines/<id>/updates/<id>" line of a pipeline run. */
export function parsePipelineUpdateId(output: string): string | undefined {
    return /https:\/\/\S*\/updates\/([^\s/?#]+)/.exec(output)?.[1];
}

async function run(cli: Cli, args: string[], ctx: CliCallContext) {
    try {
        return await cli.exec(args, ctx);
    } catch (e) {
        if (e instanceof CliError && MISSING_VARIABLE.test(e.stderr)) {
            throw new MissingVariableError(e);
        }
        throw e;
    }
}

function parseJson<T>(schema: z.ZodType<T>, stdout: string, command: string): T {
    let raw: unknown;
    try {
        raw = JSON.parse(stdout);
    } catch {
        throw new Error(`Can't parse the output of databricks ${command}`);
    }
    return schema.parse(raw);
}

/**
 * `bundle schema`: the JSON schema of bundle configuration files, as text.
 * It needs no bundle and no workspace, so it can run anywhere.
 */
export async function bundleSchema(cli: Cli, ctx: CliCallContext): Promise<string> {
    const { stdout } = await cli.exec(["bundle", "schema"], ctx);
    JSON.parse(stdout);
    return stdout;
}
