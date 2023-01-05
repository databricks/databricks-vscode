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

export class ClusterPoliciesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ClusterPolicies", method, message);
    }
}
export class ClusterPoliciesError extends ApiError {
    constructor(method: string, message?: string) {
        super("ClusterPolicies", method, message);
    }
}

/**
 * Cluster policy limits the ability to configure clusters based on a set of
 * rules. The policy rules limit the attributes or attribute values available for
 * cluster creation. Cluster policies have ACLs that limit their use to specific
 * users and groups.
 *
 * Cluster policies let you limit users to create clusters with prescribed
 * settings, simplify the user interface and enable more users to create their
 * own clusters (by fixing and hiding some values), control cost by limiting per
 * cluster maximum cost (by setting limits on attributes whose values contribute
 * to hourly price).
 *
 * Cluster policy permissions limit which policies a user can select in the
 * Policy drop-down when the user creates a cluster: - A user who has cluster
 * create permission can select the Unrestricted policy and create
 * fully-configurable clusters. - A user who has both cluster create permission
 * and access to cluster policies can select the Unrestricted policy and policies
 * they have access to. - A user that has access to only cluster policies, can
 * select the policies they have access to.
 *
 * If no policies have been created in the workspace, the Policy drop-down does
 * not display.
 *
 * Only admin users can create, edit, and delete policies. Admin users also have
 * access to all policies.
 */
export class ClusterPoliciesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a new policy.
     *
     * Creates a new policy with prescribed settings.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreatePolicy,
        @context context?: Context
    ): Promise<model.CreatePolicyResponse> {
        const path = "/api/2.0/policies/clusters/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.CreatePolicyResponse;
    }

    /**
     * Delete a cluster policy.
     *
     * Delete a policy for a cluster. Clusters governed by this policy can still
     * run, but cannot be edited.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeletePolicy,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/policies/clusters/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Update a cluster policy.
     *
     * Update an existing policy for cluster. This operation may make some
     * clusters governed by the previous policy invalid.
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        request: model.EditPolicy,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/policies/clusters/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * Get entity.
     *
     * Get a cluster policy entity. Creation and editing is available to admins
     * only.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.Policy> {
        const path = "/api/2.0/policies/clusters/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.Policy;
    }

    /**
     * Get a cluster policy.
     *
     * Returns a list of policies accessible by the requesting user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.List,
        @context context?: Context
    ): Promise<model.ListPoliciesResponse> {
        const path = "/api/2.0/policies/clusters/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListPoliciesResponse;
    }
}

export class PolicyFamiliesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("PolicyFamilies", method, message);
    }
}
export class PolicyFamiliesError extends ApiError {
    constructor(method: string, message?: string) {
        super("PolicyFamilies", method, message);
    }
}

/**
 * View available policy families. A policy family contains a policy definition
 * providing best practices for configuring clusters for a particular use case.
 *
 * Databricks manages and provides policy families for several common cluster use
 * cases. You cannot create, edit, or delete policy families.
 *
 * Policy families cannot be used directly to create clusters. Instead, you
 * create cluster policies using a policy family. Cluster policies created using
 * a policy family inherit the policy family's policy definition.
 */
export class PolicyFamiliesService {
    constructor(readonly client: ApiClient) {}
    /**
    
	*/
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetPolicyFamilyRequest,
        @context context?: Context
    ): Promise<model.PolicyFamily> {
        const path = `/api/2.0/policy-families/${request.policy_family_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.PolicyFamily;
    }

    /**
    
	*/
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListPolicyFamiliesRequest,
        @context context?: Context
    ): Promise<model.ListPolicyFamiliesResponse> {
        const path = "/api/2.0/policy-families";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListPolicyFamiliesResponse;
    }
}
