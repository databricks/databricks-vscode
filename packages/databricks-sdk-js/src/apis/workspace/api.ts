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

export class WorkspaceRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Workspace", method, message);
    }
}
export class WorkspaceError extends ApiError {
    constructor(method: string, message?: string) {
        super("Workspace", method, message);
    }
}

/**
 * The Workspace API allows you to list, import, export, and delete notebooks and
 * folders.
 *
 * A notebook is a web-based interface to a document that contains runnable code,
 * visualizations, and explanatory text.
 */
export class WorkspaceService {
    constructor(readonly client: ApiClient) {}
    /**
     * Delete a workspace object.
     *
     * Deletes an object or a directory (and optionally recursively deletes all
     * objects in the directory). * If `path` does not exist, this call returns
     * an error `RESOURCE_DOES_NOT_EXIST`. * If `path` is a non-empty directory
     * and `recursive` is set to `false`, this call returns an error
     * `DIRECTORY_NOT_EMPTY`.
     *
     * Object deletion cannot be undone and deleting a directory recursively is
     * not atomic.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/workspace/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Export a notebook.
     *
     * Exports a notebook or the contents of an entire directory.
     *
     * If `path` does not exist, this call returns an error
     * `RESOURCE_DOES_NOT_EXIST`.
     *
     * One can only export a directory in `DBC` format. If the exported data
     * would exceed size limit, this call returns `MAX_NOTEBOOK_SIZE_EXCEEDED`.
     * Currently, this API does not support exporting a library.
     */
    @withLogContext(ExposedLoggers.SDK)
    async export(
        request: model.Export,
        @context context?: Context
    ): Promise<model.ExportResponse> {
        const path = "/api/2.0/workspace/export";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ExportResponse;
    }

    /**
     * Get status.
     *
     * Gets the status of an object or a directory. If `path` does not exist,
     * this call returns an error `RESOURCE_DOES_NOT_EXIST`.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getStatus(
        request: model.GetStatus,
        @context context?: Context
    ): Promise<model.ObjectInfo> {
        const path = "/api/2.0/workspace/get-status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ObjectInfo;
    }

    /**
     * Import a notebook.
     *
     * Imports a notebook or the contents of an entire directory. If `path`
     * already exists and `overwrite` is set to `false`, this call returns an
     * error `RESOURCE_ALREADY_EXISTS`. One can only use `DBC` format to import a
     * directory.
     */
    @withLogContext(ExposedLoggers.SDK)
    async import(
        request: model.Import,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/workspace/import";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * List contents.
     *
     * Lists the contents of a directory, or the object if it is not a
     * directory.If the input path does not exist, this call returns an error
     * `RESOURCE_DOES_NOT_EXIST`.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.List,
        @context context?: Context
    ): Promise<model.ListResponse> {
        const path = "/api/2.0/workspace/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListResponse;
    }

    /**
     * Create a directory.
     *
     * Creates the specified directory (and necessary parent directories if they
     * do not exist). If there is an object (not a directory) at any prefix of
     * the input path, this call returns an error `RESOURCE_ALREADY_EXISTS`.
     *
     * Note that if this operation fails it may have succeeded in creating some
     * of the necessary\nparrent directories.
     */
    @withLogContext(ExposedLoggers.SDK)
    async mkdirs(
        request: model.Mkdirs,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/workspace/mkdirs";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }
}
