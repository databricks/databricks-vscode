import assert from "node:assert";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import lodash from "lodash";
import yaml from "yaml";

/*
 * Ported from the old suite's `dabsFixtures.ts`. The old fixtures type the
 * YAML with the generated `BundleSchema`; these use plain objects until the
 * schema is copied.
 */

type BundleConfig = Record<string, unknown>;

function getStaticResourceName(name: string) {
    return `vscode_integration_test_${name}`;
}

export function getUniqueResourceName(name?: string) {
    const uniquePart = `${Date.now()}_${randomUUID().slice(0, 8)}`;
    return getStaticResourceName(name ? `${uniquePart}_${name}` : uniquePart);
}

/**
 * The `host` of a profile in DATABRICKS_CONFIG_FILE. The old harness set
 * DATABRICKS_HOST itself; this one reads the profile the specs sign in with.
 */
export function profileHost(profile = "DEFAULT"): string {
    const file = process.env.DATABRICKS_CONFIG_FILE;
    assert(file, "DATABRICKS_CONFIG_FILE doesn't exist");
    const section = readProfileSection(fs.readFileSync(file, "utf-8"), profile);
    const host = /^\s*host\s*=\s*(.+?)\s*$/m.exec(section ?? "")?.[1];
    assert(host, `Profile ${profile} in ${file} has no host`);
    return host;
}

/** The lines of `[profile]`, without its header. */
export function readProfileSection(content: string, profile: string): string | undefined {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === `[${profile}]`);
    if (start === -1) {
        return undefined;
    }
    const end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
    return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

/** Appends a copy of `[from]`, with the same host and credentials, as `[to]`. */
export function copyProfile(from: string, to: string) {
    const file = process.env.DATABRICKS_CONFIG_FILE;
    assert(file, "DATABRICKS_CONFIG_FILE doesn't exist");
    const section = readProfileSection(fs.readFileSync(file, "utf-8"), from);
    assert(section, `Profile ${from} doesn't exist in ${file}`);
    fs.appendFileSync(file, `\n[${to}]\n${section.trim()}\n`);
}

/** `topLevelComputeId: false` leaves the cluster out, as the serverless spec asks. */
export function getBasicBundleConfig(
    overrides: BundleConfig = {},
    topLevelComputeId = true,
): BundleConfig {
    const host = process.env.DATABRICKS_HOST ?? profileHost();
    const defaultBundleConfig = {
        bundle: {
            name: getUniqueResourceName("basic_bundle"),
            // The old harness always had a cluster; this one may not.
            ...(topLevelComputeId && process.env.TEST_DEFAULT_CLUSTER_ID
                ? { cluster_id: process.env.TEST_DEFAULT_CLUSTER_ID }
                : {}),
        },
        targets: {
            dev_test: {
                mode: "development",
                default: true,
                workspace: { host },
            },
        },
    };
    return lodash.merge(defaultBundleConfig, overrides);
}

export async function writeRootBundleConfig(config: BundleConfig, workspacePath: string) {
    await fs.promises.writeFile(path.join(workspacePath, "databricks.yml"), yaml.stringify(config));
}

type SimpleJob = { name?: string; tasks?: Record<string, unknown>[]; job_clusters?: unknown[] };

export function getSimpleJobsResource(def: Omit<SimpleJob, "name">): SimpleJob {
    const defaultSimpleJob: SimpleJob = {
        name: getUniqueResourceName(),
        tasks: undefined,
        job_clusters: [
            {
                job_cluster_key: "job_cluster",
                new_cluster: {
                    spark_version: "13.3.x-scala2.12",
                    node_type_id: "Standard_D3_v2",
                    autoscale: { min_workers: 1, max_workers: 2 },
                },
            },
        ],
    };
    def = Object.assign({}, def);
    def.tasks = def.tasks?.map((task) => {
        if (
            task.job_cluster_key === undefined &&
            task.new_cluster === undefined &&
            task.existing_cluster_id === undefined
        ) {
            task.job_cluster_key = "job_cluster";
        }
        return task;
    });
    return lodash.merge(defaultSimpleJob, def);
}

/**
 * Writes a root bundle with one job whose notebook task runs on `clusterId`:
 *
 *     <vscodeWorkspaceRoot>
 *      ├── databricks.yml
 *      └── src
 *        └── notebook.ipynb
 */
export async function createProjectWithJob(
    projectName: string,
    vscodeWorkspaceRoot: string,
    clusterId: string,
) {
    const notebookTaskName = getUniqueResourceName("notebook_task");
    const jobDef = getSimpleJobsResource({
        tasks: [
            {
                task_key: notebookTaskName,
                notebook_task: { notebook_path: "src/notebook.ipynb" },
                existing_cluster_id: clusterId,
            },
        ],
    });
    const schemaDef = getBasicBundleConfig({
        bundle: { name: projectName, deployment: {} },
        targets: { dev_test: { resources: { jobs: { vscode_integration_test: jobDef } } } },
    });
    await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);
    await fs.promises.mkdir(path.join(vscodeWorkspaceRoot, "src"), { recursive: true });
    await fs.promises.copyFile(
        path.join(import.meta.dirname, "../resources/spark_select_1.ipynb"),
        path.join(vscodeWorkspaceRoot, "src", "notebook.ipynb"),
    );
    return jobDef;
}

/**
 * Writes a root bundle with one pipeline whose notebook defines a view and a
 * materialized view:
 *
 *     <vscodeWorkspaceRoot>
 *      ├── databricks.yml
 *      └── src
 *        └── notebook.ipynb
 */
export async function createProjectWithPipeline(vscodeWorkspaceRoot: string) {
    const projectName = getUniqueResourceName("deploy_and_validate_pipeline");
    const pipelineName = getUniqueResourceName("dlt_pipeline");
    const schemaDef = getBasicBundleConfig({
        bundle: { name: projectName, deployment: {} },
        targets: {
            dev_test: {
                resources: {
                    pipelines: {
                        vscode_integration_test: {
                            name: pipelineName,
                            target: "vscode_integration_test",
                            clusters: [
                                {
                                    label: "default",
                                    policy_id: "001196FD671F30D0",
                                    apply_policy_default_values: true,
                                },
                            ],
                            libraries: [{ notebook: { path: "src/notebook.ipynb" } }],
                        },
                    },
                },
            },
        },
    });
    await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);
    await fs.promises.mkdir(path.join(vscodeWorkspaceRoot, "src"), { recursive: true });
    await fs.promises.copyFile(
        path.join(import.meta.dirname, "../resources/dlt_pipeline.ipynb"),
        path.join(vscodeWorkspaceRoot, "src", "notebook.ipynb"),
    );
    return pipelineName;
}

/**
 * Writes a `lib.py` and a run file under `nested/` that imports it:
 *
 *     <projectDir>
 *      ├── lib.py
 *      └── nested
 *        └── hello.py
 *
 * With "show", hello.py prints a query result. With "json", it writes the
 * result to `file-output.json` in the run's cwd, so a spec can read it back.
 */
export async function writeHelloWorldFiles(projectDir: string, output: "show" | "json") {
    await fs.promises.writeFile(
        path.join(projectDir, "lib.py"),
        output === "show"
            ? ["def func(spark):", `\tspark.sql('SELECT "hello world"').show()`].join("\n")
            : `def func(spark):\treturn spark.sql('SELECT "hello world"')`,
    );
    const nestedDir = path.join(projectDir, "nested");
    await fs.promises.mkdir(nestedDir, { recursive: true });
    await fs.promises.writeFile(
        path.join(nestedDir, "hello.py"),
        (output === "show"
            ? [`from lib import func`, "func(spark)"]
            : [
                  `from lib import func`,
                  `import os`,
                  `df = func(spark).toPandas()`,
                  `df.to_json(os.path.join(os.getcwd(), "file-output.json"))`,
              ]
        ).join("\n"),
    );
}
