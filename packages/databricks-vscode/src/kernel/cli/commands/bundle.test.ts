import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CancelledError } from "../../../platform/errors";
import { fakeCli } from "../../../test-support/fakeCli";
import { CliError } from "../Cli";
import {
    bundleDeploy,
    bundleDestroy,
    bundleRun,
    bundleSummary,
    bundleValidate,
    deployArgs,
    destroyArgs,
    MissingVariableError,
    parseJobRunId,
    parsePipelineUpdateId,
    runArgs,
    summaryArgs,
    summaryOutput,
    validateArgs,
    validateOutput,
} from "./bundle";

/** Captured from CLI 1.19.0; the bundles are the `*.databricks.yml` files beside them. */
const FIXTURES = path.join(__dirname, "fixtures", "bundle");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
const ctx = { env: {} };

describe("bundle validate and summary", () => {
    it("builds the old arguments, and --force-pull only when asked", () => {
        expect(validateArgs("dev")).toEqual([
            "bundle",
            "validate",
            "--target",
            "dev",
            "--output",
            "json",
        ]);
        expect(summaryArgs("dev")).toEqual([
            "bundle",
            "summary",
            "--target",
            "dev",
            "--include-locations",
            "--output",
            "json",
        ]);
        expect(summaryArgs("dev", { forcePull: true })).toContain("--force-pull");
    });

    const outputs = fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));

    it.each(outputs)("parses the golden output %s", (file) => {
        const schema = file.includes(".summary.") ? summaryOutput : validateOutput;
        const parsed = schema.parse(JSON.parse(fixture(file)));
        expect(parsed.bundle?.target).toBe(file.split(".")[1]);
        // Fields the schema doesn't name are kept.
        expect(parsed).toHaveProperty("presets");
    });

    it("reads the job, its tasks and their locations from a summary", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "summary"], { stdout: fixture("job.dev_test.summary.json") });
        const summary = await bundleSummary(cli, "dev_test", ctx);
        const job = summary.resources?.jobs?.vscode_integration_test;
        expect(job).toMatchObject({
            name: "[dev e2e] integration_job",
            modified_status: "created",
        });
        expect(((job?.tasks ?? []) as { task_key: string }[]).map((t) => t.task_key)).toEqual([
            "notebook_task",
            "python_task",
        ]);
        expect(summary.__locations?.locations["resources.jobs.vscode_integration_test"]).toEqual([
            [0, 12, 11],
        ]);
    });

    it("reads resolved, complex and per-target variables from validate", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "validate", "--target", "dev_test"], {
            stdout: fixture("variables.dev_test.validate.json"),
        });
        runner.on(["bundle", "validate", "--target", "complex"], {
            stdout: fixture("complex-variable.dev_test.validate.json"),
        });
        runner.on(["bundle", "validate", "--target", "dev_test2"], {
            stdout: fixture("two-targets.dev_test2.validate.json"),
        });
        expect((await bundleValidate(cli, "dev_test", ctx)).variables).toMatchObject({
            catalog: { value: "dev_catalog" },
            warehouse: { value: "small", description: "The warehouse" },
        });
        expect((await bundleValidate(cli, "complex", ctx)).variables?.cluster).toMatchObject({
            type: "complex",
            value: { num_workers: 1, spark_version: "13.3.x-scala2.12" },
        });
        expect((await bundleValidate(cli, "dev_test2", ctx)).variables?.greeting?.value).toBe(
            "bonjour",
        );
    });

    it("treats an empty summary as an empty bundle", async () => {
        const { cli } = fakeCli();
        expect(await bundleSummary(cli, "dev", ctx)).toEqual({});
    });

    it("turns a missing variable into MissingVariableError, and other failures into CliError", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "validate", "--target", "a"], {
            exitCode: 1,
            stderr: 'Error: no value assigned to required variable warehouse. Assignment can be done using "--var"',
        });
        runner.on(["bundle", "validate", "--target", "b"], {
            exitCode: 1,
            stderr: "Error: notebook src/nb.ipynb not found",
        });
        await expect(bundleValidate(cli, "a", ctx)).rejects.toBeInstanceOf(MissingVariableError);
        await expect(bundleValidate(cli, "b", ctx)).rejects.toBeInstanceOf(CliError);
    });

    it("fails clearly on output that isn't JSON, and stays silent on cancellation", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "validate", "--target", "a"], { stdout: "not json" });
        runner.on(["bundle", "validate", "--target", "b"], { cancelled: true, exitCode: null });
        await expect(bundleValidate(cli, "a", ctx)).rejects.toThrow(
            "Can't parse the output of databricks bundle validate",
        );
        await expect(bundleValidate(cli, "b", ctx)).rejects.toBeInstanceOf(CancelledError);
    });
});

describe("bundle deploy and destroy", () => {
    it("builds the old arguments", () => {
        expect(deployArgs("dev")).toEqual(["bundle", "deploy", "--target", "dev", "--verbose"]);
        expect(deployArgs("dev", { force: true })).toEqual([
            "bundle",
            "deploy",
            "--target",
            "dev",
            "--verbose",
            "--force-lock",
            "--force",
        ]);
        expect(destroyArgs("dev")).toEqual([
            "bundle",
            "destroy",
            "--target",
            "dev",
            "--auto-approve",
        ]);
        expect(destroyArgs("dev", { force: true })).toEqual([
            "bundle",
            "destroy",
            "--target",
            "dev",
            "--auto-approve",
            "--force-lock",
        ]);
    });

    it("streams stdout and stderr to the caller", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "deploy"], (_args, options) => {
            options.onStdout?.("out\n");
            options.onStderr?.("err\n");
            return {};
        });
        const chunks: string[] = [];
        await bundleDeploy(cli, "dev", {
            env: {},
            onStdout: (c) => chunks.push(`stdout ${c}`),
            onStderr: (c) => chunks.push(`stderr ${c}`),
        });
        expect(chunks).toEqual(["stdout out\n", "stderr err\n"]);
    });

    it("throws MissingVariableError, CliError and CancelledError like validate", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "deploy"], {
            exitCode: 1,
            stderr: 'Error: no value assigned to required variable "x"',
        });
        await expect(bundleDeploy(cli, "dev", ctx)).rejects.toBeInstanceOf(MissingVariableError);
        runner.on(["bundle", "destroy"], {
            exitCode: 1,
            stderr: "Error: deploy lock acquired by someone else",
        });
        await expect(bundleDestroy(cli, "dev", ctx)).rejects.toBeInstanceOf(CliError);
        runner.on(["bundle", "destroy"], { cancelled: true, exitCode: null });
        await expect(bundleDestroy(cli, "dev", ctx)).rejects.toBeInstanceOf(CancelledError);
    });
});

describe("bundle run", () => {
    it("builds the old arguments, with the pipeline variants", () => {
        expect(runArgs("dev", "jobs.etl")).toEqual([
            "bundle",
            "run",
            "--target",
            "dev",
            "jobs.etl",
        ]);
        expect(runArgs("dev", "pipelines.p", { validateOnly: true })).toEqual([
            "bundle",
            "run",
            "--target",
            "dev",
            "pipelines.p",
            "--validate-only",
        ]);
        expect(runArgs("dev", "pipelines.p", { refresh: ["a", "b"] })).toEqual([
            "bundle",
            "run",
            "--target",
            "dev",
            "pipelines.p",
            "--refresh",
            "a,b",
        ]);
        expect(runArgs("dev", "pipelines.p", { fullRefresh: ["a"] })).toEqual([
            "bundle",
            "run",
            "--target",
            "dev",
            "pipelines.p",
            "--full-refresh",
            "a",
        ]);
        expect(runArgs("dev", "jobs.etl", { extraArgs: ["--", "--k", "v"] })).toEqual([
            "bundle",
            "run",
            "--target",
            "dev",
            "jobs.etl",
            "--",
            "--k",
            "v",
        ]);
    });

    it("streams the output and throws like deploy", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.("Run URL: https://h/jobs/1/runs/2\n");
            return {};
        });
        const chunks: string[] = [];
        await bundleRun(cli, "dev", "jobs.etl", { env: {}, onStdout: (c) => chunks.push(c) });
        expect(chunks).toEqual(["Run URL: https://h/jobs/1/runs/2\n"]);
        runner.on(["bundle", "run"], { exitCode: 1, stderr: "Error: run failed" });
        await expect(bundleRun(cli, "dev", "jobs.etl", ctx)).rejects.toBeInstanceOf(CliError);
        runner.on(["bundle", "run"], { cancelled: true, exitCode: null });
        await expect(bundleRun(cli, "dev", "jobs.etl", ctx)).rejects.toBeInstanceOf(CancelledError);
    });
});

// Ported from the old `JobRunStatus.test.ts`. They pin the CLI-output contract
// the job tracker depends on: when the CLI changed "#job/<id>/run/<id>" to
// "/jobs/<id>/runs/<id>?o=…", the old singular regex stopped matching and the
// extension showed a false "Timeout while fetching run status".
describe("parseJobRunId", () => {
    it("extracts the run id from the modern '/jobs/<id>/runs/<id>' URL", () => {
        expect(
            parseJobRunId(
                "Run URL: https://adb-123.azuredatabricks.net/jobs/600749519600807/runs/931844287868435?o=1234567890123456",
            ),
        ).toBe("931844287868435");
    });

    it("extracts the run id from the 'Run available at ...' modern URL", () => {
        expect(
            parseJobRunId(
                "Run available at https://adb-123.azuredatabricks.net/jobs/600749519600807/runs/931844287868435?o=1234567890123456",
            ),
        ).toBe("931844287868435");
    });

    it("extracts the run id from the legacy '#job/<id>/run/<id>' fragment URL", () => {
        expect(
            parseJobRunId(
                "https://adb-123.azuredatabricks.net/?o=1234567890123456#job/600749519600807/run/931844287868435",
            ),
        ).toBe("931844287868435");
    });

    it("does not capture the job id from a '/jobs/<id>' URL without a run segment", () => {
        expect(
            parseJobRunId("https://adb-123.azuredatabricks.net/jobs/600749519600807"),
        ).toBeUndefined();
    });

    it("does not return an empty run id when the output ends right after '/runs/'", () => {
        expect(
            parseJobRunId("Run URL: https://adb-123.azuredatabricks.net/jobs/1/runs/"),
        ).toBeUndefined();
    });

    it("ignores output that contains no run URL", () => {
        expect(parseJobRunId("Deploying resources...")).toBeUndefined();
    });
});

describe("parsePipelineUpdateId", () => {
    it("extracts the update id from the Update URL line", () => {
        expect(
            parsePipelineUpdateId(
                "Update URL: https://adb-123.azuredatabricks.net/#joblist/pipelines/0b6f-pipeline/updates/8a1c2d3e-4f50-6789-abcd-ef0123456789",
            ),
        ).toBe("8a1c2d3e-4f50-6789-abcd-ef0123456789");
        expect(
            parsePipelineUpdateId("Update URL: https://h/#joblist/pipelines/p/updates/u1\r"),
        ).toBe("u1");
    });

    it("ignores other output", () => {
        expect(parsePipelineUpdateId("2026-10-03 12:00:00 update RUNNING")).toBeUndefined();
        expect(parsePipelineUpdateId("https://h/#joblist/pipelines/p")).toBeUndefined();
    });
});
