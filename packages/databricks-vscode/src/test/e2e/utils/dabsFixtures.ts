/* eslint-disable @typescript-eslint/naming-convention */
import {randomUUID} from "node:crypto";
import {Resource, BundleTarget} from "../../../bundle/types.ts";

type SimpleJob = Pick<
    Resource<BundleTarget, "jobs">,
    "name" | "tasks" | "job_clusters" | "compute"
>;

export function getSimpleJobsResource(def: Omit<SimpleJob, "name">) {
    const uuid = randomUUID().slice(0, 8);
    const defaultSimpleJob: SimpleJob = {
        name: `vscode-integration-test-${uuid}`,
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
            task.existing_cluster_id === undefined &&
            task.compute_key === undefined
        ) {
            task.job_cluster_key = "job_cluster";
        }
        return task;
    });

    return {
        ...defaultSimpleJob,
        ...def,
    };
}
