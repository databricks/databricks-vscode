/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";

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

*/
export class ExperimentsService {
    constructor(readonly client: ApiClient) {}
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
    async create(
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
     * Delete an experiment.
     *
     * Marks an experiment and associated metadata, runs, metrics, params, and
     * tags for deletion. If the experiment uses FileStore, artifacts associated
     * with experiment are also deleted.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
     * Get an experiment.
     *
     * Gets metadata for an experiment. This method works on deleted experiments.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * Get metadata.
     *
     * "Gets metadata for an experiment.
     *
     * This endpoint will return deleted experiments, but prefers the active
     * experiment if an active and deleted experiment share the same name. If
     * multiple deleted experiments share the same name, the API will return one
     * of them.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no experiment with the specified name
     * exists.S
     */
    @withLogContext(ExposedLoggers.SDK)
    async getByName(
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
     * List experiments.
     *
     * Gets a list of all experiments.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
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
     * Restores an experiment.
     *
     * "Restore an experiment marked for deletion. This also restores associated
     * metadata, runs, metrics, params, and tags. If experiment uses FileStore,
     * underlying artifacts associated with experiment are also restored.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if experiment was never created or was
     * permanently deleted.",
     */
    @withLogContext(ExposedLoggers.SDK)
    async restore(
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
     * Search experiments.
     *
     * Searches for experiments that satisfy specified search criteria.
     */
    @withLogContext(ExposedLoggers.SDK)
    async search(
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
        const path = "/api/2.0/mlflow/experiments/set-experiment-tag";
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
    async update(
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
}

export class MLflowArtifactsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("MLflowArtifacts", method, message);
    }
}
export class MLflowArtifactsError extends ApiError {
    constructor(method: string, message?: string) {
        super("MLflowArtifacts", method, message);
    }
}

/**

*/
export class MLflowArtifactsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get all artifacts.
     *
     * List artifacts for a run. Takes an optional `artifact_path` prefix. If it
     * is specified, the response contains only artifacts with the specified
     * prefix.",
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
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
}

export class MLflowDatabricksRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("MLflowDatabricks", method, message);
    }
}
export class MLflowDatabricksError extends ApiError {
    constructor(method: string, message?: string) {
        super("MLflowDatabricks", method, message);
    }
}

/**
 * These endpoints are modified versions of the MLflow API that accept additional
 * input parameters or return additional information.
 */
export class MLflowDatabricksService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get model.
     *
     * Get the details of a model. This is a Databricks Workspace version of the
     * [MLflow endpoint] that also returns the model's Databricks Workspace ID
     * and the permission level of the requesting user on the model.
     *
     * [MLflow endpoint]: https://www.mlflow.org/docs/latest/rest-api.html#get-registeredmodel
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetMLflowDatabrickRequest,
        @context context?: Context
    ): Promise<model.GetResponse> {
        const path = "/api/2.0/mlflow/databricks/registered-models/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetResponse;
    }

    /**
     * Transition a stage.
     *
     * Transition a model version's stage. This is a Databricks Workspace version
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
        const path =
            "/api/2.0/mlflow/databricks/model-versions/transition-stage";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.TransitionStageResponse;
    }
}

export class MLflowMetricsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("MLflowMetrics", method, message);
    }
}
export class MLflowMetricsError extends ApiError {
    constructor(method: string, message?: string) {
        super("MLflowMetrics", method, message);
    }
}

/**

*/
export class MLflowMetricsService {
    constructor(readonly client: ApiClient) {}
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
        const path = "/api/2.0/mlflow/metrics/get-history";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetMetricHistoryResponse;
    }
}

export class MLflowRunsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("MLflowRuns", method, message);
    }
}
export class MLflowRunsError extends ApiError {
    constructor(method: string, message?: string) {
        super("MLflowRuns", method, message);
    }
}

/**

*/
export class MLflowRunsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a run.
     *
     * Creates a new run within an experiment. A run is usually a single
     * execution of a machine learning or data ETL pipeline. MLflow uses runs to
     * track the `mlflowParam`, `mlflowMetric` and `mlflowRunTag` associated with
     * a single execution.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
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
     * Delete a run.
     *
     * Marks a run for deletion.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
        const path = "/api/2.0/mlflow/runs/delete-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a run.
     *
     * "Gets the metadata, metrics, params, and tags for a run. In the case where
     * multiple metrics with the same key are logged for a run, return only the
     * value with the latest timestamp.
     *
     * If there are multiple values with the latest timestamp, return the maximum
     * of these values.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * metrics - Up to 100 params * Up to 100 tags
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
        const path = "/api/2.0/mlflow/runs/log-batch";
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
        const path = "/api/2.0/mlflow/runs/log-metric";
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
        const path = "/api/2.0/mlflow/runs/log-model";
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
    async logParameter(
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
     * Restore a run.
     *
     * Restores a deleted run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async restore(
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
     * Search for runs.
     *
     * Searches for runs that satisfy expressions.
     *
     * Search expressions can use `mlflowMetric` and `mlflowParam` keys.",
     */
    @withLogContext(ExposedLoggers.SDK)
    async search(
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
        const path = "/api/2.0/mlflow/runs/set-tag";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update a run.
     *
     * Updates run metadata.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
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
}

export class ModelVersionCommentsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ModelVersionComments", method, message);
    }
}
export class ModelVersionCommentsError extends ApiError {
    constructor(method: string, message?: string) {
        super("ModelVersionComments", method, message);
    }
}

/**

*/
export class ModelVersionCommentsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Post a comment.
     *
     * Posts a comment on a model version. A comment can be submitted either by a
     * user or programmatically to display relevant information about the model.
     * For example, test results or deployment errors.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateComment,
        @context context?: Context
    ): Promise<model.CreateResponse> {
        const path = "/api/2.0/mlflow/comments/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateResponse;
    }

    /**
     * Delete a comment.
     *
     * Deletes a comment on a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteModelVersionCommentRequest,
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
     * Update a comment.
     *
     * Post an edit to a comment on a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateComment,
        @context context?: Context
    ): Promise<model.UpdateResponse> {
        const path = "/api/2.0/mlflow/comments/update";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.UpdateResponse;
    }
}

export class ModelVersionsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ModelVersions", method, message);
    }
}
export class ModelVersionsError extends ApiError {
    constructor(method: string, message?: string) {
        super("ModelVersions", method, message);
    }
}

/**

*/
export class ModelVersionsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a model version.
     *
     * Creates a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
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
     * Delete a model version.
     *
     * Deletes a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
     * Delete a model version tag.
     *
     * Deletes a model version tag.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteTag(
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
     * Get a model version.
     *
     * Get a model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * Get a model version URI.
     *
     * Gets a URI to download the model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getDownloadUri(
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
     * Searches model versions.
     *
     * Searches for specific model versions based on the supplied __filter__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async search(
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
     * Set a version tag.
     *
     * Sets a model version tag.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setTag(
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
     * Transition a stage.
     *
     * Transition to the next model stage.
     */
    @withLogContext(ExposedLoggers.SDK)
    async transitionStage(
        request: model.TransitionModelVersionStage,
        @context context?: Context
    ): Promise<model.TransitionModelVersionStageResponse> {
        const path = "/api/2.0/mlflow/model-versions/transition-stage";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.TransitionModelVersionStageResponse;
    }

    /**
     * Update model version.
     *
     * Updates the model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
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
}

export class RegisteredModelsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("RegisteredModels", method, message);
    }
}
export class RegisteredModelsError extends ApiError {
    constructor(method: string, message?: string) {
        super("RegisteredModels", method, message);
    }
}

/**

*/
export class RegisteredModelsService {
    constructor(readonly client: ApiClient) {}
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
    async create(
        request: model.CreateRegisteredModelRequest,
        @context context?: Context
    ): Promise<model.CreateRegisteredModelResponse> {
        const path = "/api/2.0/mlflow/registered-models/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateRegisteredModelResponse;
    }

    /**
     * Delete a model.
     *
     * Deletes a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteRegisteredModelRequest,
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
     * Delete a model tag.
     *
     * Deletes the tag for a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteTag(
        request: model.DeleteRegisteredModelTagRequest,
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
     * Get a model.
     *
     * Gets the registered model that matches the specified ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetRegisteredModelRequest,
        @context context?: Context
    ): Promise<model.GetRegisteredModelResponse> {
        const path = "/api/2.0/mlflow/registered-models/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetRegisteredModelResponse;
    }

    /**
     * Get the latest version.
     *
     * Gets the latest version of a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getLatestVersions(
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
     * List models.
     *
     * Lists all available registered models, up to the limit specified in
     * __max_results__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListRegisteredModelsRequest,
        @context context?: Context
    ): Promise<model.ListRegisteredModelsResponse> {
        const path = "/api/2.0/mlflow/registered-models/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListRegisteredModelsResponse;
    }

    /**
     * Rename a model.
     *
     * Renames a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async rename(
        request: model.RenameRegisteredModelRequest,
        @context context?: Context
    ): Promise<model.RenameRegisteredModelResponse> {
        const path = "/api/2.0/mlflow/registered-models/rename";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RenameRegisteredModelResponse;
    }

    /**
     * Search models.
     *
     * Search for registered models based on the specified __filter__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async search(
        request: model.SearchRegisteredModelsRequest,
        @context context?: Context
    ): Promise<model.SearchRegisteredModelsResponse> {
        const path = "/api/2.0/mlflow/registered-models/search";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.SearchRegisteredModelsResponse;
    }

    /**
     * Set a tag.
     *
     * Sets a tag on a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setTag(
        request: model.SetRegisteredModelTagRequest,
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
     * Update model.
     *
     * Updates a registered model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateRegisteredModelRequest,
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
}

export class RegistryWebhooksRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("RegistryWebhooks", method, message);
    }
}
export class RegistryWebhooksError extends ApiError {
    constructor(method: string, message?: string) {
        super("RegistryWebhooks", method, message);
    }
}

/**

*/
export class RegistryWebhooksService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a webhook.
     *
     * **NOTE**: This endpoint is in Public Preview.
     *
     * Creates a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateRegistryWebhook,
        @context context?: Context
    ): Promise<model.CreateResponse> {
        const path = "/api/2.0/mlflow/registry-webhooks/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateResponse;
    }

    /**
     * Delete a webhook.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Deletes a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteRegistryWebhookRequest,
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
     * List registry webhooks.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Lists all registry webhooks.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListRegistryWebhooksRequest,
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
     * Test a webhook.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Tests a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async test(
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
     * Update a webhook.
     *
     * **NOTE:** This endpoint is in Public Preview.
     *
     * Updates a registry webhook.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
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
}

export class TransitionRequestsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("TransitionRequests", method, message);
    }
}
export class TransitionRequestsError extends ApiError {
    constructor(method: string, message?: string) {
        super("TransitionRequests", method, message);
    }
}

/**

*/
export class TransitionRequestsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Approve transition requests.
     *
     * Approves a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async approve(
        request: model.ApproveTransitionRequest,
        @context context?: Context
    ): Promise<model.ApproveResponse> {
        const path = "/api/2.0/mlflow/transition-requests/approve";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ApproveResponse;
    }

    /**
     * Make a transition request.
     *
     * Creates a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateTransitionRequest,
        @context context?: Context
    ): Promise<model.CreateResponse> {
        const path = "/api/2.0/mlflow/transition-requests/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateResponse;
    }

    /**
     * Delete a ransition request.
     *
     * Cancels a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
     * List transition requests.
     *
     * Gets a list of all open stage transition requests for the model version.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListTransitionRequestsRequest,
        @context context?: Context
    ): Promise<model.ListResponse> {
        const path = "/api/2.0/mlflow/transition-requests/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListResponse;
    }

    /**
     * Reject a transition request.
     *
     * Rejects a model version stage transition request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async reject(
        request: model.RejectTransitionRequest,
        @context context?: Context
    ): Promise<model.RejectResponse> {
        const path = "/api/2.0/mlflow/transition-requests/reject";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RejectResponse;
    }
}
