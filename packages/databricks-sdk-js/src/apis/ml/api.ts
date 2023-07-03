/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Experiments, Model Registry, etc.
 */

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

export class ExperimentsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Experiments", method, message);
    }
}
export class ExperimentsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Experiments", method, message);
    }
}

/**
 * Experiments are the primary unit of organization in MLflow; all MLflow runs
 * belong to an experiment. Each experiment lets you visualize, search, and
 * compare runs, as well as download run artifacts or metadata for analysis in
 * other tools. Experiments are maintained in a Databricks hosted MLflow tracking
 * server.
 *
 * Experiments are located in the workspace file tree. You manage experiments
 * using the same tools you use to manage other workspace objects such as
 * folders, notebooks, and libraries.
 */
export class ExperimentsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _createExperiment(
        request: model.CreateExperiment,
        @context context?: Context
    ): Promise<model.CreateExperimentResponse> {
        const path = "/api/2.0/mlflow/experiments/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateExperimentResponse;
    }

    /**
     * Create experiment.
     *
     * Creates an experiment with a name. Returns the ID of the newly created
     * experiment. Validates that another experiment with the same name does not
     * already exist and fails if another experiment with the same name already
     * exists.
     *
     * Throws `RESOURCE_ALREADY_EXISTS` if a experiment with the given name
     * exists.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createExperiment(
        request: model.CreateExperiment,
        @context context?: Context
    ): Promise<model.CreateExperimentResponse> {
        return await this._createExperiment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _createRun(
        request: model.CreateRun,
        @context context?: Context
    ): Promise<model.CreateRunResponse> {
        const path = "/api/2.0/mlflow/runs/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateRunResponse;
    }

    /**
     * Create a run.
     *
     * Creates a new run within an experiment. A run is usually a single
     * execution of a machine learning or data ETL pipeline. MLflow uses runs to
     * track the `mlflowParam`, `mlflowMetric` and `mlflowRunTag` associated with
     * a single execution.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createRun(
        request: model.CreateRun,
        @context context?: Context
    ): Promise<model.CreateRunResponse> {
        return await this._createRun(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteExperiment(
        request: model.DeleteExperiment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/experiments/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete an experiment.
     *
     * Marks an experiment and associated metadata, runs, metrics, params, and
     * tags for deletion. If the experiment uses FileStore, artifacts associated
     * with experiment are also deleted.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteExperiment(
        request: model.DeleteExperiment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteExperiment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteRun(
        request: model.DeleteRun,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a run.
     *
     * Marks a run for deletion.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteRun(
        request: model.DeleteRun,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteRun(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteTag(
        request: model.DeleteTag,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/delete-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a tag.
     *
     * Deletes a tag on a run. Tags are run metadata that can be updated during a
     * run and after a run completes.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteTag(
        request: model.DeleteTag,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getByName(
        request: model.GetByNameRequest,
        @context context?: Context
    ): Promise<model.GetExperimentByNameResponse> {
        const path = "/api/2.0/mlflow/experiments/get-by-name";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetExperimentByNameResponse;
    }

    /**
     * Get metadata.
     *
     * Gets metadata for an experiment.
     *
     * This endpoint will return deleted experiments, but prefers the active
     * experiment if an active and deleted experiment share the same name. If
     * multiple deleted experiments share the same name, the API will return one
     * of them.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no experiment with the specified name
     * exists.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getByName(
        request: model.GetByNameRequest,
        @context context?: Context
    ): Promise<model.GetExperimentByNameResponse> {
        return await this._getByName(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getExperiment(
        request: model.GetExperimentRequest,
        @context context?: Context
    ): Promise<model.Experiment> {
        const path = "/api/2.0/mlflow/experiments/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Experiment;
    }

    /**
     * Get an experiment.
     *
     * Gets metadata for an experiment. This method works on deleted experiments.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getExperiment(
        request: model.GetExperimentRequest,
        @context context?: Context
    ): Promise<model.Experiment> {
        return await this._getExperiment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getHistory(
        request: model.GetHistoryRequest,
        @context context?: Context
    ): Promise<model.GetMetricHistoryResponse> {
        const path = "/api/2.0/mlflow/metrics/get-history";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetMetricHistoryResponse;
    }

    /**
     * Get history of a given metric within a run.
     *
     * Gets a list of all values for the specified metric for a given run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getHistory(
        request: model.GetHistoryRequest,
        @context context?: Context
    ): Promise<model.GetMetricHistoryResponse> {
        return await this._getHistory(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getRun(
        request: model.GetRunRequest,
        @context context?: Context
    ): Promise<model.GetRunResponse> {
        const path = "/api/2.0/mlflow/runs/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetRunResponse;
    }

    /**
     * Get a run.
     *
     * Gets the metadata, metrics, params, and tags for a run. In the case where
     * multiple metrics with the same key are logged for a run, return only the
     * value with the latest timestamp.
     *
     * If there are multiple values with the latest timestamp, return the maximum
     * of these values.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getRun(
        request: model.GetRunRequest,
        @context context?: Context
    ): Promise<model.GetRunResponse> {
        return await this._getRun(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listArtifacts(
        request: model.ListArtifactsRequest,
        @context context?: Context
    ): Promise<model.ListArtifactsResponse> {
        const path = "/api/2.0/mlflow/artifacts/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListArtifactsResponse;
    }

    /**
     * Get all artifacts.
     *
     * List artifacts for a run. Takes an optional `artifact_path` prefix. If it
     * is specified, the response contains only artifacts with the specified
     * prefix.",
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listArtifacts(
        request: model.ListArtifactsRequest,
        @context context?: Context
    ): AsyncIterable<model.FileInfo> {
        while (true) {
            const response = await this._listArtifacts(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.files || response.files.length === 0) {
                break;
            }

            for (const v of response.files) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listExperiments(
        request: model.ListExperimentsRequest,
        @context context?: Context
    ): Promise<model.ListExperimentsResponse> {
        const path = "/api/2.0/mlflow/experiments/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListExperimentsResponse;
    }

    /**
     * List experiments.
     *
     * Gets a list of all experiments.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listExperiments(
        request: model.ListExperimentsRequest,
        @context context?: Context
    ): AsyncIterable<model.Experiment> {
        while (true) {
            const response = await this._listExperiments(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.experiments || response.experiments.length === 0) {
                break;
            }

            for (const v of response.experiments) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _logBatch(
        request: model.LogBatch,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/log-batch";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Log a batch.
     *
     * Logs a batch of metrics, params, and tags for a run. If any data failed to
     * be persisted, the server will respond with an error (non-200 status code).
     *
     * In case of error (due to internal server error or an invalid request),
     * partial data may be written.
     *
     * You can write metrics, params, and tags in interleaving fashion, but
     * within a given entity type are guaranteed to follow the order specified in
     * the request body.
     *
     * The overwrite behavior for metrics, params, and tags is as follows:
     *
     * * Metrics: metric values are never overwritten. Logging a metric (key,
     * value, timestamp) appends to the set of values for the metric with the
     * provided key.
     *
     * * Tags: tag values can be overwritten by successive writes to the same tag
     * key. That is, if multiple tag values with the same key are provided in the
     * same API request, the last-provided tag value is written. Logging the same
     * tag (key, value) is permitted. Specifically, logging a tag is idempotent.
     *
     * * Parameters: once written, param values cannot be changed (attempting to
     * overwrite a param value will result in an error). However, logging the
     * same param (key, value) is permitted. Specifically, logging a param is
     * idempotent.
     *
     * Request Limits ------------------------------- A single JSON-serialized
     * API request may be up to 1 MB in size and contain:
     *
     * * No more than 1000 metrics, params, and tags in total * Up to 1000
     * metrics * Up to 100 params * Up to 100 tags
     *
     * For example, a valid request might contain 900 metrics, 50 params, and 50
     * tags, but logging 900 metrics, 50 params, and 51 tags is invalid.
     *
     * The following limits also apply to metric, param, and tag keys and values:
     *
     * * Metric keyes, param keys, and tag keys can be up to 250 characters in
     * length * Parameter and tag values can be up to 250 characters in length
     */
    @withLogContext(ExposedLoggers.SDK)
    async logBatch(
        request: model.LogBatch,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._logBatch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _logInputs(
        request: model.LogInputs,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/log-inputs";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Log inputs to a run.
     *
     * **NOTE:** Experimental: This API may change or be removed in a future
     * release without warning.
     */
    @withLogContext(ExposedLoggers.SDK)
    async logInputs(
        request: model.LogInputs,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._logInputs(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _logMetric(
        request: model.LogMetric,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/log-metric";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Log a metric.
     *
     * Logs a metric for a run. A metric is a key-value pair (string key, float
     * value) with an associated timestamp. Examples include the various metrics
     * that represent ML model accuracy. A metric can be logged multiple times.
     */
    @withLogContext(ExposedLoggers.SDK)
    async logMetric(
        request: model.LogMetric,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._logMetric(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _logModel(
        request: model.LogModel,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/log-model";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Log a model.
     *
     * **NOTE:** Experimental: This API may change or be removed in a future
     * release without warning.
     */
    @withLogContext(ExposedLoggers.SDK)
    async logModel(
        request: model.LogModel,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._logModel(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _logParam(
        request: model.LogParam,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/log-parameter";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Log a param.
     *
     * Logs a param used for a run. A param is a key-value pair (string key,
     * string value). Examples include hyperparameters used for ML model training
     * and constant dates and values used in an ETL pipeline. A param can be
     * logged only once for a run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async logParam(
        request: model.LogParam,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._logParam(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _restoreExperiment(
        request: model.RestoreExperiment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/experiments/restore";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Restores an experiment.
     *
     * Restore an experiment marked for deletion. This also restores associated
     * metadata, runs, metrics, params, and tags. If experiment uses FileStore,
     * underlying artifacts associated with experiment are also restored.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if experiment was never created or was
     * permanently deleted.
     */
    @withLogContext(ExposedLoggers.SDK)
    async restoreExperiment(
        request: model.RestoreExperiment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._restoreExperiment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _restoreRun(
        request: model.RestoreRun,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/restore";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Restore a run.
     *
     * Restores a deleted run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async restoreRun(
        request: model.RestoreRun,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._restoreRun(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _searchExperiments(
        request: model.SearchExperiments,
        @context context?: Context
    ): Promise<model.SearchExperimentsResponse> {
        const path = "/api/2.0/mlflow/experiments/search";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.SearchExperimentsResponse;
    }

    /**
     * Search experiments.
     *
     * Searches for experiments that satisfy specified search criteria.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *searchExperiments(
        request: model.SearchExperiments,
        @context context?: Context
    ): AsyncIterable<model.Experiment> {
        while (true) {
            const response = await this._searchExperiments(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.experiments || response.experiments.length === 0) {
                break;
            }

            for (const v of response.experiments) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _searchRuns(
        request: model.SearchRuns,
        @context context?: Context
    ): Promise<model.SearchRunsResponse> {
        const path = "/api/2.0/mlflow/runs/search";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.SearchRunsResponse;
    }

    /**
     * Search for runs.
     *
     * Searches for runs that satisfy expressions.
     *
     * Search expressions can use `mlflowMetric` and `mlflowParam` keys.",
     */
    @withLogContext(ExposedLoggers.SDK)
    async *searchRuns(
        request: model.SearchRuns,
        @context context?: Context
    ): AsyncIterable<model.Run> {
        while (true) {
            const response = await this._searchRuns(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.runs || response.runs.length === 0) {
                break;
            }

            for (const v of response.runs) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _setExperimentTag(
        request: model.SetExperimentTag,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/experiments/set-experiment-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Set a tag.
     *
     * Sets a tag on an experiment. Experiment tags are metadata that can be
     * updated.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setExperimentTag(
        request: model.SetExperimentTag,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._setExperimentTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _setTag(
        request: model.SetTag,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/runs/set-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Set a tag.
     *
     * Sets a tag on a run. Tags are run metadata that can be updated during a
     * run and after a run completes.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setTag(
        request: model.SetTag,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._setTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateExperiment(
        request: model.UpdateExperiment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/experiments/update";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update an experiment.
     *
     * Updates experiment metadata.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateExperiment(
        request: model.UpdateExperiment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._updateExperiment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateRun(
        request: model.UpdateRun,
        @context context?: Context
    ): Promise<model.UpdateRunResponse> {
        const path = "/api/2.0/mlflow/runs/update";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.UpdateRunResponse;
    }

    /**
     * Update a run.
     *
     * Updates run metadata.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateRun(
        request: model.UpdateRun,
        @context context?: Context
    ): Promise<model.UpdateRunResponse> {
        return await this._updateRun(request, context);
    }
}

export class ModelRegistryRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ModelRegistry", method, message);
    }
}
export class ModelRegistryError extends ApiError {
    constructor(method: string, message?: string) {
        super("ModelRegistry", method, message);
    }
}

/**
 * MLflow Model Registry is a centralized model repository and a UI and set of
 * APIs that enable you to manage the full lifecycle of MLflow Models.
 */
export class ModelRegistryService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _approveTransitionRequest(
        request: model.ApproveTransitionRequest,
        @context context?: Context
    ): Promise<model.ApproveTransitionRequestResponse> {
        const path = "/api/2.0/mlflow/transition-requests/approve";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ApproveTransitionRequestResponse;
    }

    /**
     * Approve transition request.
     *
     * Approves a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async approveTransitionRequest(
        request: model.ApproveTransitionRequest,
        @context context?: Context
    ): Promise<model.ApproveTransitionRequestResponse> {
        return await this._approveTransitionRequest(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _createComment(
        request: model.CreateComment,
        @context context?: Context
    ): Promise<model.CreateCommentResponse> {
        const path = "/api/2.0/mlflow/comments/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateCommentResponse;
    }

    /**
     * Post a comment.
     *
     * Posts a comment on a model version. A comment can be submitted either by a
     * user or programmatically to display relevant information about the model.
     * For example, test results or deployment errors.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createComment(
        request: model.CreateComment,
        @context context?: Context
    ): Promise<model.CreateCommentResponse> {
        return await this._createComment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _createModel(
        request: model.CreateModelRequest,
        @context context?: Context
    ): Promise<model.CreateModelResponse> {
        const path = "/api/2.0/mlflow/registered-models/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateModelResponse;
    }

    /**
     * Create a model.
     *
     * Creates a new registered model with the name specified in the request
     * body.
     *
     * Throws `RESOURCE_ALREADY_EXISTS` if a registered model with the given name
     * exists.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createModel(
        request: model.CreateModelRequest,
        @context context?: Context
    ): Promise<model.CreateModelResponse> {
        return await this._createModel(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _createModelVersion(
        request: model.CreateModelVersionRequest,
        @context context?: Context
    ): Promise<model.CreateModelVersionResponse> {
        const path = "/api/2.0/mlflow/model-versions/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateModelVersionResponse;
    }

    /**
     * Create a model version.
     *
     * Creates a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createModelVersion(
        request: model.CreateModelVersionRequest,
        @context context?: Context
    ): Promise<model.CreateModelVersionResponse> {
        return await this._createModelVersion(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _createTransitionRequest(
        request: model.CreateTransitionRequest,
        @context context?: Context
    ): Promise<model.CreateTransitionRequestResponse> {
        const path = "/api/2.0/mlflow/transition-requests/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateTransitionRequestResponse;
    }

    /**
     * Make a transition request.
     *
     * Creates a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createTransitionRequest(
        request: model.CreateTransitionRequest,
        @context context?: Context
    ): Promise<model.CreateTransitionRequestResponse> {
        return await this._createTransitionRequest(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _createWebhook(
        request: model.CreateRegistryWebhook,
        @context context?: Context
    ): Promise<model.CreateWebhookResponse> {
        const path = "/api/2.0/mlflow/registry-webhooks/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateWebhookResponse;
    }

    /**
     * Create a webhook.
     *
     * **NOTE**: This endpoint is in Public Preview.
     *
     * Creates a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createWebhook(
        request: model.CreateRegistryWebhook,
        @context context?: Context
    ): Promise<model.CreateWebhookResponse> {
        return await this._createWebhook(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteComment(
        request: model.DeleteCommentRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/comments/delete";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a comment.
     *
     * Deletes a comment on a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteComment(
        request: model.DeleteCommentRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteComment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteModel(
        request: model.DeleteModelRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/registered-models/delete";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a model.
     *
     * Deletes a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteModel(
        request: model.DeleteModelRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteModel(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteModelTag(
        request: model.DeleteModelTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/registered-models/delete-tag";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a model tag.
     *
     * Deletes the tag for a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteModelTag(
        request: model.DeleteModelTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteModelTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteModelVersion(
        request: model.DeleteModelVersionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/model-versions/delete";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a model version.
     *
     * Deletes a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteModelVersion(
        request: model.DeleteModelVersionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteModelVersion(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteModelVersionTag(
        request: model.DeleteModelVersionTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/model-versions/delete-tag";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a model version tag.
     *
     * Deletes a model version tag.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteModelVersionTag(
        request: model.DeleteModelVersionTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteModelVersionTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteTransitionRequest(
        request: model.DeleteTransitionRequestRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/transition-requests/delete";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a transition request.
     *
     * Cancels a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteTransitionRequest(
        request: model.DeleteTransitionRequestRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteTransitionRequest(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteWebhook(
        request: model.DeleteWebhookRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/registry-webhooks/delete";
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a webhook.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Deletes a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteWebhook(
        request: model.DeleteWebhookRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._deleteWebhook(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getLatestVersions(
        request: model.GetLatestVersionsRequest,
        @context context?: Context
    ): Promise<model.GetLatestVersionsResponse> {
        const path = "/api/2.0/mlflow/registered-models/get-latest-versions";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.GetLatestVersionsResponse;
    }

    /**
     * Get the latest version.
     *
     * Gets the latest version of a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *getLatestVersions(
        request: model.GetLatestVersionsRequest,
        @context context?: Context
    ): AsyncIterable<model.ModelVersion> {
        const response = (await this._getLatestVersions(request, context))
            .model_versions;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getModel(
        request: model.GetModelRequest,
        @context context?: Context
    ): Promise<model.GetModelResponse> {
        const path = "/api/2.0/mlflow/databricks/registered-models/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetModelResponse;
    }

    /**
     * Get model.
     *
     * Get the details of a model. This is a Databricks workspace version of the
     * [MLflow endpoint] that also returns the model's Databricks workspace ID
     * and the permission level of the requesting user on the model.
     *
     * [MLflow endpoint]: https://www.mlflow.org/docs/latest/rest-api.html#get-registeredmodel
     */
    @withLogContext(ExposedLoggers.SDK)
    async getModel(
        request: model.GetModelRequest,
        @context context?: Context
    ): Promise<model.GetModelResponse> {
        return await this._getModel(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getModelVersion(
        request: model.GetModelVersionRequest,
        @context context?: Context
    ): Promise<model.GetModelVersionResponse> {
        const path = "/api/2.0/mlflow/model-versions/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetModelVersionResponse;
    }

    /**
     * Get a model version.
     *
     * Get a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getModelVersion(
        request: model.GetModelVersionRequest,
        @context context?: Context
    ): Promise<model.GetModelVersionResponse> {
        return await this._getModelVersion(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getModelVersionDownloadUri(
        request: model.GetModelVersionDownloadUriRequest,
        @context context?: Context
    ): Promise<model.GetModelVersionDownloadUriResponse> {
        const path = "/api/2.0/mlflow/model-versions/get-download-uri";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetModelVersionDownloadUriResponse;
    }

    /**
     * Get a model version URI.
     *
     * Gets a URI to download the model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getModelVersionDownloadUri(
        request: model.GetModelVersionDownloadUriRequest,
        @context context?: Context
    ): Promise<model.GetModelVersionDownloadUriResponse> {
        return await this._getModelVersionDownloadUri(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listModels(
        request: model.ListModelsRequest,
        @context context?: Context
    ): Promise<model.ListModelsResponse> {
        const path = "/api/2.0/mlflow/registered-models/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListModelsResponse;
    }

    /**
     * List models.
     *
     * Lists all available registered models, up to the limit specified in
     * __max_results__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listModels(
        request: model.ListModelsRequest,
        @context context?: Context
    ): AsyncIterable<model.Model> {
        while (true) {
            const response = await this._listModels(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (
                !response.registered_models ||
                response.registered_models.length === 0
            ) {
                break;
            }

            for (const v of response.registered_models) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listTransitionRequests(
        request: model.ListTransitionRequestsRequest,
        @context context?: Context
    ): Promise<model.ListTransitionRequestsResponse> {
        const path = "/api/2.0/mlflow/transition-requests/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListTransitionRequestsResponse;
    }

    /**
     * List transition requests.
     *
     * Gets a list of all open stage transition requests for the model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listTransitionRequests(
        request: model.ListTransitionRequestsRequest,
        @context context?: Context
    ): AsyncIterable<model.Activity> {
        const response = (await this._listTransitionRequests(request, context))
            .requests;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listWebhooks(
        request: model.ListWebhooksRequest,
        @context context?: Context
    ): Promise<model.ListRegistryWebhooks> {
        const path = "/api/2.0/mlflow/registry-webhooks/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListRegistryWebhooks;
    }

    /**
     * List registry webhooks.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Lists all registry webhooks.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listWebhooks(
        request: model.ListWebhooksRequest,
        @context context?: Context
    ): AsyncIterable<model.RegistryWebhook> {
        while (true) {
            const response = await this._listWebhooks(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.webhooks || response.webhooks.length === 0) {
                break;
            }

            for (const v of response.webhooks) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _rejectTransitionRequest(
        request: model.RejectTransitionRequest,
        @context context?: Context
    ): Promise<model.RejectTransitionRequestResponse> {
        const path = "/api/2.0/mlflow/transition-requests/reject";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RejectTransitionRequestResponse;
    }

    /**
     * Reject a transition request.
     *
     * Rejects a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async rejectTransitionRequest(
        request: model.RejectTransitionRequest,
        @context context?: Context
    ): Promise<model.RejectTransitionRequestResponse> {
        return await this._rejectTransitionRequest(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _renameModel(
        request: model.RenameModelRequest,
        @context context?: Context
    ): Promise<model.RenameModelResponse> {
        const path = "/api/2.0/mlflow/registered-models/rename";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RenameModelResponse;
    }

    /**
     * Rename a model.
     *
     * Renames a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async renameModel(
        request: model.RenameModelRequest,
        @context context?: Context
    ): Promise<model.RenameModelResponse> {
        return await this._renameModel(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _searchModelVersions(
        request: model.SearchModelVersionsRequest,
        @context context?: Context
    ): Promise<model.SearchModelVersionsResponse> {
        const path = "/api/2.0/mlflow/model-versions/search";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.SearchModelVersionsResponse;
    }

    /**
     * Searches model versions.
     *
     * Searches for specific model versions based on the supplied __filter__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *searchModelVersions(
        request: model.SearchModelVersionsRequest,
        @context context?: Context
    ): AsyncIterable<model.ModelVersion> {
        while (true) {
            const response = await this._searchModelVersions(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (
                !response.model_versions ||
                response.model_versions.length === 0
            ) {
                break;
            }

            for (const v of response.model_versions) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _searchModels(
        request: model.SearchModelsRequest,
        @context context?: Context
    ): Promise<model.SearchModelsResponse> {
        const path = "/api/2.0/mlflow/registered-models/search";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.SearchModelsResponse;
    }

    /**
     * Search models.
     *
     * Search for registered models based on the specified __filter__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *searchModels(
        request: model.SearchModelsRequest,
        @context context?: Context
    ): AsyncIterable<model.Model> {
        while (true) {
            const response = await this._searchModels(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (
                !response.registered_models ||
                response.registered_models.length === 0
            ) {
                break;
            }

            for (const v of response.registered_models) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _setModelTag(
        request: model.SetModelTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/registered-models/set-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Set a tag.
     *
     * Sets a tag on a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setModelTag(
        request: model.SetModelTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._setModelTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _setModelVersionTag(
        request: model.SetModelVersionTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/model-versions/set-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Set a version tag.
     *
     * Sets a model version tag.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setModelVersionTag(
        request: model.SetModelVersionTagRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._setModelVersionTag(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _testRegistryWebhook(
        request: model.TestRegistryWebhookRequest,
        @context context?: Context
    ): Promise<model.TestRegistryWebhookResponse> {
        const path = "/api/2.0/mlflow/registry-webhooks/test";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.TestRegistryWebhookResponse;
    }

    /**
     * Test a webhook.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Tests a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async testRegistryWebhook(
        request: model.TestRegistryWebhookRequest,
        @context context?: Context
    ): Promise<model.TestRegistryWebhookResponse> {
        return await this._testRegistryWebhook(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _transitionStage(
        request: model.TransitionModelVersionStageDatabricks,
        @context context?: Context
    ): Promise<model.TransitionStageResponse> {
        const path =
            "/api/2.0/mlflow/databricks/model-versions/transition-stage";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.TransitionStageResponse;
    }

    /**
     * Transition a stage.
     *
     * Transition a model version's stage. This is a Databricks workspace version
     * of the [MLflow endpoint] that also accepts a comment associated with the
     * transition to be recorded.",
     *
     * [MLflow endpoint]: https://www.mlflow.org/docs/latest/rest-api.html#transition-modelversion-stage
     */
    @withLogContext(ExposedLoggers.SDK)
    async transitionStage(
        request: model.TransitionModelVersionStageDatabricks,
        @context context?: Context
    ): Promise<model.TransitionStageResponse> {
        return await this._transitionStage(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateComment(
        request: model.UpdateComment,
        @context context?: Context
    ): Promise<model.UpdateCommentResponse> {
        const path = "/api/2.0/mlflow/comments/update";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.UpdateCommentResponse;
    }

    /**
     * Update a comment.
     *
     * Post an edit to a comment on a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateComment(
        request: model.UpdateComment,
        @context context?: Context
    ): Promise<model.UpdateCommentResponse> {
        return await this._updateComment(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateModel(
        request: model.UpdateModelRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/registered-models/update";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update model.
     *
     * Updates a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateModel(
        request: model.UpdateModelRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._updateModel(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateModelVersion(
        request: model.UpdateModelVersionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/model-versions/update";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update model version.
     *
     * Updates the model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateModelVersion(
        request: model.UpdateModelVersionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._updateModelVersion(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateWebhook(
        request: model.UpdateRegistryWebhook,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/mlflow/registry-webhooks/update";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update a webhook.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Updates a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateWebhook(
        request: model.UpdateRegistryWebhook,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._updateWebhook(request, context);
    }
}
