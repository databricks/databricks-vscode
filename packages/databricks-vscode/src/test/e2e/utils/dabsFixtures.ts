/* eslint-disable @typescript-eslint/naming-convention */
import {Resource, BundleTarget, BundleSchema} from "../../../bundle/types.ts";
import path from "path";
import assert from "assert";
import {writeFile, unlink} from "fs/promises";
import {getUniqueResourceName} from "./commonUtils.ts";
import yaml from "yaml";
import lodash from "lodash";

type SimpleJob = Pick<
    Resource<BundleTarget, "jobs">,
    "name" | "tasks" | "job_clusters"
>;

export function getSimpleJobsResource(def: Omit<SimpleJob, "name">) {
    const defaultSimpleJob: SimpleJob = {
        name: getUniqueResourceName(),
        tasks: undefined,
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
    const defaultBundleConfig = {
        bundle: {
            name: getUniqueResourceName("basic_bundle"),
            compute_id: topLevelComputeId
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
