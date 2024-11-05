/* eslint-disable @typescript-eslint/naming-convention */
import {Resource, BundleTarget, BundleSchema} from "../../../bundle/types.ts";
import fs from "fs/promises";
import path from "path";
import assert from "assert";
import {writeFile, unlink} from "fs/promises";
import {getUniqueResourceName} from "./commonUtils.ts";
import yaml from "yaml";
import lodash from "lodash";
import {fileURLToPath} from "url";

/* eslint-disable @typescript-eslint/naming-convention */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* eslint-enable @typescript-eslint/naming-convention */

type SimpleJob = Pick<
    Resource<BundleTarget, "jobs">,
    "name" | "tasks" | "job_clusters"
>;

export function getSimpleJobsResource(def: Omit<SimpleJob, "name">) {
    const defaultSimpleJob: SimpleJob = {
        name: getUniqueResourceName(),
        tasks: undefined,
        /* eslint-disable @typescript-eslint/naming-convention */
        job_clusters: [
            {
                job_cluster_key: "job_cluster",
                new_cluster: {
                    spark_version: "13.3.x-scala2.12",
                    node_type_id: "Standard_D3_v2",
                    autoscale: {
                        min_workers: 1,
                        max_workers: 2,
                    },
                },
            },
        ],
        /* eslint-enable @typescript-eslint/naming-convention */
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

export function getBasicBundleConfig(
    overrides: BundleSchema = {},
    topLevelComputeId = true
): BundleSchema {
    assert(process.env.DATABRICKS_HOST, "DATABRICKS_HOST doesn't exist");
    assert(
        process.env.TEST_DEFAULT_CLUSTER_ID,
        "TEST_DEFAULT_CLUSTER_ID doesn't exist"
    );
    /* eslint-disable @typescript-eslint/naming-convention */
    const defaultBundleConfig = {
        bundle: {
            name: getUniqueResourceName("basic_bundle"),
            cluster_id: topLevelComputeId
                ? process.env.TEST_DEFAULT_CLUSTER_ID
                : undefined,
        },
        targets: {
            dev_test: {
                mode: "development",
                default: true,
                workspace: {
                    host: process.env.DATABRICKS_HOST,
                },
            },
        },
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    return lodash.merge(defaultBundleConfig, overrides);
}

export async function writeRootBundleConfig(
    config: BundleSchema,
    workspacePath: string
) {
    const bundleConfig = path.join(workspacePath, "databricks.yml");
    await writeFile(bundleConfig, yaml.stringify(config));
}

export async function clearRootBundleConfig(workspacePath: string) {
    const bundleConfig = path.join(workspacePath, "databricks.yml");
    await unlink(bundleConfig);
}

export async function createProjectWithJob(
    vscodeWorkspaceRoot: string,
    clusterId: string
) {
    /**
     * process.env.WORKSPACE_PATH (cwd)
     *  ├── databricks.yml
     *  └── src
     *    └── notebook.ipynb
     */

    const projectName = getUniqueResourceName("deploy_and_run_job");
    const notebookTaskName = getUniqueResourceName("notebook_task");
    /* eslint-disable @typescript-eslint/naming-convention */
    const jobDef = getSimpleJobsResource({
        tasks: [
            {
                task_key: notebookTaskName,
                notebook_task: {
                    notebook_path: "src/notebook.ipynb",
                },
                existing_cluster_id: clusterId,
            },
        ],
    });
    const schemaDef: BundleSchema = getBasicBundleConfig({
        bundle: {
            name: projectName,
            deployment: {},
        },
        targets: {
            dev_test: {
                resources: {
                    jobs: {
                        vscode_integration_test: jobDef,
                    },
                },
            },
        },
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

    await fs.mkdir(path.join(vscodeWorkspaceRoot, "src"), {
        recursive: true,
    });
    await fs.copyFile(
        path.join(__dirname, "../resources/spark_select_1.ipynb"),
        path.join(vscodeWorkspaceRoot, "src", "notebook.ipynb")
    );

    return jobDef!.name!;
}

export async function createProjectWithPipeline(vscodeWorkspaceRoot: string) {
    //
    // process.env.WORKSPACE_PATH (cwd)
    //  ├── databricks.yml
    //  └── src
    //    └── notebook.ipynb
    //
    // dlt_pipeline:
    //   name: dlt_pipeline
    //   libraries:
    //     - notebook:
    //         path: src/notebook.ipynb

    const projectName = getUniqueResourceName("deploy_and_validate_pipeline");
    const pipelineName = getUniqueResourceName("dlt_pipeline");
    /* eslint-disable @typescript-eslint/naming-convention */
    const schemaDef: BundleSchema = getBasicBundleConfig({
        bundle: {
            name: projectName,
            deployment: {},
        },
        targets: {
            dev_test: {
                resources: {
                    pipelines: {
                        vscode_integration_test: {
                            name: pipelineName,
                            target: "vscode_integration_test",
                            libraries: [
                                {
                                    notebook: {
                                        path: "src/notebook.ipynb",
                                    },
                                },
                            ],
                        },
                    },
                },
            },
        },
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

    await fs.mkdir(path.join(vscodeWorkspaceRoot, "src"), {
        recursive: true,
    });
    await fs.copyFile(
        path.join(__dirname, "../resources/dlt_pipeline.ipynb"),
        path.join(vscodeWorkspaceRoot, "src", "notebook.ipynb")
    );

    return pipelineName;
}
