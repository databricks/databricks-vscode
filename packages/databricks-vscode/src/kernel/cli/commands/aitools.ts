import { z } from "zod";
import { CliError, type Cli, type CliCallContext } from "../Cli";

/*
 * `databricks aitools list|install|update|uninstall` (AI-02). The schemas
 * name only what the extension reads and keep everything else
 * (`looseObject`). Golden outputs from CLI 1.19.0 in `fixtures/aitools/` pin
 * them. Ported from the old `CliWrapper.aitools*`.
 */

/** Where AI tools are installed: the project folder, or the home folder. */
export type AiToolsScope = "project" | "global";

const byScope = <T extends z.ZodType>(schema: T) =>
    z.looseObject({ project: schema.optional(), global: schema.optional() });

const skill = z.looseObject({
    name: z.string(),
    latest_version: z.string(),
    experimental: z.boolean().optional(),
    /** The installed version per scope; empty when the skill isn't installed. */
    installed: byScope(z.string()),
});

const agentInstallation = z.looseObject({
    version: z.string().optional(),
    /** `skills` when a managed agent received only the raw skills. */
    delivery: z.string().optional(),
});

const agent = z.looseObject({
    name: z.string(),
    display_name: z.string(),
    managed: z.boolean(),
    detected: z.boolean(),
    /** Older CLIs omit it; absent reads as supported. */
    supports_project_scope: z.boolean().optional(),
    installed: byScope(agentInstallation),
});

/** `aitools list --output json`. */
const aiToolsListOutput = z.looseObject({
    release: z.string().optional(),
    skills: z.array(skill).default([]),
    agents: z.array(agent).default([]),
});
export type AiToolsListOutput = z.infer<typeof aiToolsListOutput>;
export type AiToolsAgent = z.infer<typeof agent>;
export type AiToolsSkill = z.infer<typeof skill>;

const installAgentResult = z.looseObject({
    name: z.string(),
    /** `plugin`, `skills` or `skip`. */
    delivery: z.string().optional(),
    /** `installed`, `skipped` or `failed`. */
    status: z.string(),
    /** A closed category, for telemetry. `message` is free text and never sent. */
    error_category: z.string().optional(),
    message: z.string().optional(),
});

/**
 * `aitools install --output json`. Printed on a failing exit too. A
 * top-level failure carries `error` and may omit `agents` (Go's `omitempty`).
 */
const aiToolsInstallOutput = z.looseObject({
    scope: z.string().optional(),
    agents: z.array(installAgentResult).default([]),
    error: z.string().optional(),
    error_category: z.string().optional(),
});
export type AiToolsInstallOutput = z.infer<typeof aiToolsInstallOutput>;

/**
 * The install result in `stdout`, or undefined when it isn't one: a CLI old
 * enough to print text, or a failure without JSON. It counts as a result when
 * it has an `agents` array or a string `error`/`error_category`.
 */
export function parseAiToolsInstallOutput(stdout: string): AiToolsInstallOutput | undefined {
    let raw: unknown;
    try {
        raw = JSON.parse(stdout);
    } catch {
        return undefined;
    }
    if (typeof raw !== "object" || raw === null) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    const hasAgents = Array.isArray(record.agents);
    const hasError = typeof record.error === "string" || typeof record.error_category === "string";
    if (!hasAgents && !hasError) {
        return undefined;
    }
    const parsed = aiToolsInstallOutput.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
}

/** `aitools list`. Throws `CliError`, or a parse error for output that isn't the list. */
export async function aiToolsList(cli: Cli, ctx: CliCallContext): Promise<AiToolsListOutput> {
    const { stdout } = await cli.exec(["aitools", "list", "--output", "json"], ctx);
    let raw: unknown;
    try {
        raw = JSON.parse(stdout);
    } catch {
        throw new Error("Can't parse the output of databricks aitools list");
    }
    return aiToolsListOutput.parse(raw);
}

export function aiToolsInstallArgs(scope: AiToolsScope, agents: readonly string[]): string[] {
    return [
        "aitools",
        "install",
        "--scope",
        scope,
        "--agents",
        agents.join(","),
        "--output",
        "json",
    ];
}

/**
 * `aitools install` for the named agents. Never throws for a failing exit:
 * it returns the parsed result with the error, so the caller can record the
 * error categories that only a failed install's JSON carries. Throws
 * `CancelledError` when aborted.
 */
export async function aiToolsInstall(
    cli: Cli,
    scope: AiToolsScope,
    agents: readonly string[],
    ctx: CliCallContext,
): Promise<{ output?: AiToolsInstallOutput; error?: CliError }> {
    try {
        const { stdout } = await cli.exec(aiToolsInstallArgs(scope, agents), ctx);
        return { output: parseAiToolsInstallOutput(stdout) };
    } catch (e) {
        if (e instanceof CliError) {
            return { output: parseAiToolsInstallOutput(e.stdout), error: e };
        }
        throw e;
    }
}

/** `aitools update`. Throws `CliError` or `CancelledError`. */
export async function aiToolsUpdate(
    cli: Cli,
    scope: AiToolsScope,
    ctx: CliCallContext,
): Promise<void> {
    await cli.exec(["aitools", "update", "--scope", scope], ctx);
}

/** `aitools uninstall`. Throws `CliError` or `CancelledError`. */
export async function aiToolsUninstall(
    cli: Cli,
    scope: AiToolsScope,
    ctx: CliCallContext,
): Promise<void> {
    await cli.exec(["aitools", "uninstall", "--scope", scope], ctx);
}
