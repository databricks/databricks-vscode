/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

interface JobsSubmitRequest {
    tasks: Array<{
        task_key: string;
        depends_on?: Array<string>;
        existing_cluster_id?: string;
        new_cluster?: any; //TODO
        notebook_task?: {
            notebook_path: string;
            base_parameters?: any;
        };
        spark_jar_task?: any; //TODO
        spark_python_task?: {
            python_file: string;
            parameters?: Array<string>;
        };
        spark_submit_task?: any; //TODO
        pipeline_task?: any; //TODO
        python_wheel_task?: any; //TODO
        libraries?: Array<{
            jar?: string;
            egg?: string;
            whl?: string;
            pypi?: {
                package: string;
                repo?: string;
            };
            maven?: {
                coordinates: string;
                repo: string;
                exclusions: Array<string>;
            };
            cran?: {
                package: string;
                repo?: string;
            };
        }>;
        timeout_seconds?: number;
    }>;
    run_name?: string;
    git_source?: any; // TODO
    timeout_seconds?: number;
    idempotency_token?: string;
    access_control_list?: Array<{
        user_name: string;
        permission_level:
            | "CAN_MANAGE"
            | "CAN_MANAGE_RUN"
            | "CAN_VIEW"
            | "IS_OWNER";
    }>;
}

interface JobsSubmitResponse {
    run_id: number;
}

interface JobsGetRunRequest {
    run_id: number;
    include_history?: boolean;
}

export type RunLifeCycleState =
    | "PENDING"
    | "RUNNING"
    | "TERMINATING"
    | "TERMINATED"
    | "SKIPPED"
    | "INTERNAL_ERROR";
export type ResultState = "SUCCESS" | "FAILED" | "TIMEDOUT" | "CANCELED";
export type TriggerType = "PERIODIC" | "ONE_TIME" | "RETRY";
export type RunType = "JOB_RUN" | "WORKFLOW_RUN" | "SUBMIT_RUN";

export interface JobsGetRunResponse {
    job_id: number;
    run_id: number;
    number_in_job: number;
    creator_user_name: string;
    original_attempt_run_id: number;
    state: {
        life_cycle_state: RunLifeCycleState;
        result_state: ResultState;
        user_cancelled_or_timedout: boolean;
        state_message: string;
    };
    schedule?: {
        quartz_cron_expression: string;
        timezone_id: string;
        pause_status: "PAUSED" | "UNPAUSED";
    };
    tasks: Array<any>; //TODO
    job_clusters: Array<any>; //TODO
    clusters_spec: Array<any>; //TODO
    cluster_instance: {
        cluster_id: string;
        spark_context_id: string;
    };
    git_source?: any; // TODO
    overriding_parameters: any;
    start_time: number;
    setup_duration: number;
    execution_duration: number;
    cleanup_duration: number;
    end_time: number;
    trigger: TriggerType;
    run_name: string;
    run_page_url: string;
    run_type: RunType;
    attempt_number: number;
    repair_history: Array<any>; // TODO
}

export interface JobsGetRunOutputRequest {
    run_id: number;
}

export interface JobsGetRunOutputResponse {
    notebook_output: {
        result: string;
        truncated: boolean;
    };
    logs: string;
    logs_truncated: boolean;
    error: string;
    error_trace: string;
    metadata: JobsGetRunResponse;
}

export interface JobsExportRunRequest {
    run_id: number;
    views_to_export?: "CODE" | "DASHBOARDS" | "ALL";
}

export interface JobsExportRunResponse {
    views: Array<{
        content: string;
        name: string;
        type: "NOTEBOOK" | "DASHBOARD";
    }>;
}

export class JobsService {
    constructor(readonly client: ApiClient) {}

    async submit(req: JobsSubmitRequest): Promise<JobsSubmitResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/submit",
            "POST",
            req
        )) as JobsSubmitResponse;
    }

    async getRun(req: JobsGetRunRequest): Promise<JobsGetRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get",
            "GET",
            req
        )) as JobsGetRunResponse;
    }

    async getRunOutput(
        req: JobsGetRunOutputRequest
    ): Promise<JobsGetRunOutputResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get-output",
            "GET",
            req
        )) as JobsGetRunOutputResponse;
    }

    async exportRun(req: JobsExportRunRequest): Promise<JobsExportRunResponse> {
        return (await this.client.request(
            "/api/2.0/jobs/runs/export",
            "GET",
            req
        )) as JobsExportRunResponse;
    }
}
