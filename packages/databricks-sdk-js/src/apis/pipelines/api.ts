/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * The Delta Live Tables API allows you to create, edit, delete, start, and view details about pipelines.
 */

import {ApiClient} from "../../api-client";
import * as pipelines from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types"
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context"
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";


import * as compute from "../compute"


export class PipelinesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("Pipelines", method, message)
    }
}
export class PipelinesError extends ApiError {
    constructor(method: string, message?: string){
        super("Pipelines", method, message)
    }
}

/**
* The Delta Live Tables API allows you to create, edit, delete, start, and view
* details about pipelines.
* 
* Delta Live Tables is a framework for building reliable, maintainable, and
* testable data processing pipelines. You define the transformations to perform
* on your data, and Delta Live Tables manages task orchestration, cluster
* management, monitoring, data quality, and error handling.
* 
* Instead of defining your data pipelines using a series of separate Apache
* Spark tasks, Delta Live Tables manages how your data is transformed based on a
* target schema you define for each processing step. You can also enforce data
* quality with Delta Live Tables expectations. Expectations allow you to define
* expected data quality and specify how to handle records that fail those
* expectations.
*/
export class PipelinesService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  pipelines.CreatePipeline,
            @context context?: Context
        ): Promise<
        
            pipelines.CreatePipelineResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/pipelines"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            pipelines.CreatePipelineResponse
        
    )
        }    

        
        /**
        * Create a pipeline.
    * 
    * Creates a new data processing pipeline based on the requested
    * configuration. If successful, this method returns the ID of the new
    * pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  pipelines.CreatePipeline,
            @context context?: Context
        ): Promise<
        
            pipelines.CreatePipelineResponse
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  pipelines.DeletePipelineRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a pipeline.
    * 
    * Deletes a pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  pipelines.DeletePipelineRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  pipelines.GetPipelineRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.GetPipelineResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            pipelines.GetPipelineResponse
        
    )
        }    

        
        /**
        * Get a pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(getPipelineRequest: pipelines.GetPipelineRequest,
            @context context?: Context    
        ): Promise<Waiter<
        
            pipelines.GetPipelineResponse
        
    , pipelines.GetPipelineResponse>> {
            const cancellationToken = context?.cancellationToken;

            const getPipelineResponse = await this._get(getPipelineRequest, context);

            return asWaiter(getPipelineResponse, async(options) => { 
                options = options || {};
                options.onProgress =
                    options.onProgress || (async (newPollResponse) => {});
                const {timeout, onProgress} = options;

                return await retry<pipelines.GetPipelineResponse>({
                    timeout,
                    fn: async () => {
                        const pollResponse = await this.get({
                            pipeline_id: getPipelineResponse.pipeline_id!,
                        }, context)
                        if(cancellationToken?.isCancellationRequested) {
                            context?.logger?.error("Pipelines.getAndWait: cancelled");
                            throw new PipelinesError("getAndWait", "cancelled");
                        }
                        await onProgress(pollResponse);
                        const status = pollResponse.state
                        const statusMessage = pollResponse.cause
                        switch(status) {
                            case 'RUNNING':{
                                return pollResponse
                            }
                            case 'FAILED':{
                                const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                                context?.logger?.error(`Pipelines.getAndWait: ${errorMessage}`);
                                throw new PipelinesError("getAndWait", errorMessage);
                            }
                            default:{
                                const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                                context?.logger?.error(`Pipelines.getAndWait: retrying: ${errorMessage}`);
                                throw new PipelinesRetriableError("getAndWait", errorMessage);
                            }
                        }
                    }
                });
            });
        }
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _getUpdate(request:  pipelines.GetUpdateRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.GetUpdateResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}/updates/${request.update_id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            pipelines.GetUpdateResponse
        
    )
        }    

        
        /**
        * Get a pipeline update.
    * 
    * Gets an update from an active pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getUpdate(request:  pipelines.GetUpdateRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.GetUpdateResponse
        
    >     
        {
            return await this._getUpdate(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _listPipelineEvents(request:  pipelines.ListPipelineEventsRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.ListPipelineEventsResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}/events`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            pipelines.ListPipelineEventsResponse
        
    )
        }    

        
        /**
        * List pipeline events.
    * 
    * Retrieves events for a pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *listPipelineEvents(request: pipelines.ListPipelineEventsRequest,
            @context context?: Context    
        ): AsyncIterable<pipelines.PipelineEvent> {
            
            
            while(true) {
                const response = await this._listPipelineEvents(request, context);
                if (
                    context?.cancellationToken &&
                    context?.cancellationToken.isCancellationRequested
                ) {
                    break;
                }

                if (!response.events || response.events.length === 0) {
                    break;
                }

                for (const v of response.events) {
                    yield v;
                }

                request.page_token = response.next_page_token
                if (!response.next_page_token) {
                    break;
                }
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _listPipelines(request:  pipelines.ListPipelinesRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.ListPipelinesResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/pipelines"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            pipelines.ListPipelinesResponse
        
    )
        }    

        
        /**
        * List pipelines.
    * 
    * Lists pipelines defined in the Delta Live Tables system.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *listPipelines(request: pipelines.ListPipelinesRequest,
            @context context?: Context    
        ): AsyncIterable<pipelines.PipelineStateInfo> {
            
            
            while(true) {
                const response = await this._listPipelines(request, context);
                if (
                    context?.cancellationToken &&
                    context?.cancellationToken.isCancellationRequested
                ) {
                    break;
                }

                if (!response.statuses || response.statuses.length === 0) {
                    break;
                }

                for (const v of response.statuses) {
                    yield v;
                }

                request.page_token = response.next_page_token
                if (!response.next_page_token) {
                    break;
                }
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _listUpdates(request:  pipelines.ListUpdatesRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.ListUpdatesResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}/updates`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            pipelines.ListUpdatesResponse
        
    )
        }    

        
        /**
        * List pipeline updates.
    * 
    * List updates for an active pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async listUpdates(request:  pipelines.ListUpdatesRequest,
            @context context?: Context
        ): Promise<
        
            pipelines.ListUpdatesResponse
        
    >     
        {
            return await this._listUpdates(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _reset(request:  pipelines.ResetRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}/reset`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Reset a pipeline.
    * 
    * Resets a pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async reset(resetRequest: pipelines.ResetRequest,
            @context context?: Context    
        ): Promise<Waiter<
        EmptyResponse
    , pipelines.GetPipelineResponse>> {
            const cancellationToken = context?.cancellationToken;

            await this._reset(resetRequest, context);

            return asWaiter(null, async(options) => { 
                options = options || {};
                options.onProgress =
                    options.onProgress || (async (newPollResponse) => {});
                const {timeout, onProgress} = options;

                return await retry<pipelines.GetPipelineResponse>({
                    timeout,
                    fn: async () => {
                        const pollResponse = await this.get({
                            pipeline_id: resetRequest.pipeline_id!,
                        }, context)
                        if(cancellationToken?.isCancellationRequested) {
                            context?.logger?.error("Pipelines.resetAndWait: cancelled");
                            throw new PipelinesError("resetAndWait", "cancelled");
                        }
                        await onProgress(pollResponse);
                        const status = pollResponse.state
                        const statusMessage = pollResponse.cause
                        switch(status) {
                            case 'RUNNING':{
                                return pollResponse
                            }
                            case 'FAILED':{
                                const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                                context?.logger?.error(`Pipelines.resetAndWait: ${errorMessage}`);
                                throw new PipelinesError("resetAndWait", errorMessage);
                            }
                            default:{
                                const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                                context?.logger?.error(`Pipelines.resetAndWait: retrying: ${errorMessage}`);
                                throw new PipelinesRetriableError("resetAndWait", errorMessage);
                            }
                        }
                    }
                });
            });
        }
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _startUpdate(request:  pipelines.StartUpdate,
            @context context?: Context
        ): Promise<
        
            pipelines.StartUpdateResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}/updates`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            pipelines.StartUpdateResponse
        
    )
        }    

        
        /**
        * Queue a pipeline update.
    * 
    * Starts or queues a pipeline update.
        */
        @withLogContext(ExposedLoggers.SDK)
        async startUpdate(request:  pipelines.StartUpdate,
            @context context?: Context
        ): Promise<
        
            pipelines.StartUpdateResponse
        
    >     
        {
            return await this._startUpdate(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _stop(request:  pipelines.StopRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}/stop`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Stop a pipeline.
    * 
    * Stops a pipeline.
        */
        @withLogContext(ExposedLoggers.SDK)
        async stop(stopRequest: pipelines.StopRequest,
            @context context?: Context    
        ): Promise<Waiter<
        EmptyResponse
    , pipelines.GetPipelineResponse>> {
            const cancellationToken = context?.cancellationToken;

            await this._stop(stopRequest, context);

            return asWaiter(null, async(options) => { 
                options = options || {};
                options.onProgress =
                    options.onProgress || (async (newPollResponse) => {});
                const {timeout, onProgress} = options;

                return await retry<pipelines.GetPipelineResponse>({
                    timeout,
                    fn: async () => {
                        const pollResponse = await this.get({
                            pipeline_id: stopRequest.pipeline_id!,
                        }, context)
                        if(cancellationToken?.isCancellationRequested) {
                            context?.logger?.error("Pipelines.stopAndWait: cancelled");
                            throw new PipelinesError("stopAndWait", "cancelled");
                        }
                        await onProgress(pollResponse);
                        const status = pollResponse.state
                        const statusMessage = pollResponse.cause
                        switch(status) {
                            case 'IDLE':{
                                return pollResponse
                            }
                            case 'FAILED':{
                                const errorMessage = `failed to reach IDLE state, got ${status}: ${statusMessage}`;
                                context?.logger?.error(`Pipelines.stopAndWait: ${errorMessage}`);
                                throw new PipelinesError("stopAndWait", errorMessage);
                            }
                            default:{
                                const errorMessage = `failed to reach IDLE state, got ${status}: ${statusMessage}`;
                                context?.logger?.error(`Pipelines.stopAndWait: retrying: ${errorMessage}`);
                                throw new PipelinesRetriableError("stopAndWait", errorMessage);
                            }
                        }
                    }
                });
            });
        }
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  pipelines.EditPipeline,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/pipelines/${request.pipeline_id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Edit a pipeline.
    * 
    * Updates a pipeline with the supplied configuration.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  pipelines.EditPipeline,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}
