/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreatePolicy {
    /**
     * Policy definition document expressed in Databricks Cluster Policy
     * Definition Language.
     */
    definition?: string;
    /**
     * Additional human-readable description of the cluster policy.
     */
    description?: string;
    /**
     * Max number of clusters per user that can be active using this policy. If
     * not present, there is no max limit.
     */
    max_clusters_per_user?: number;
    /**
     * Cluster Policy name requested by the user. This has to be unique. Length
     * must be between 1 and 100 characters.
     */
    name: string;
    /**
     * Policy definition JSON document expressed in Databricks Policy Definition
     * Language. The JSON document must be passed as a string and cannot be
     * embedded in the requests.
     *
     * You can use this to customize the policy definition inherited from the
     * policy family. Policy rules specified here are merged into the inherited
     * policy definition.
     */
    policy_family_definition_overrides?: string;
    /**
     * ID of the policy family. The cluster policy's policy definition inherits
     * the policy family's policy definition.
     *
     * Cannot be used with `definition`. Use `policy_family_definition_overrides`
     * instead to customize the policy definition.
     */
    policy_family_id?: string;
}

export interface CreatePolicyResponse {
    /**
     * Canonical unique identifier for the cluster policy.
     */
    policy_id?: string;
}

export interface DeletePolicy {
    /**
     * The ID of the policy to delete.
     */
    policy_id: string;
}

export interface EditPolicy {
    /**
     * Policy definition document expressed in Databricks Cluster Policy
     * Definition Language.
     */
    definition?: string;
    /**
     * Additional human-readable description of the cluster policy.
     */
    description?: string;
    /**
     * Max number of clusters per user that can be active using this policy. If
     * not present, there is no max limit.
     */
    max_clusters_per_user?: number;
    /**
     * Cluster Policy name requested by the user. This has to be unique. Length
     * must be between 1 and 100 characters.
     */
    name: string;
    /**
     * Policy definition JSON document expressed in Databricks Policy Definition
     * Language. The JSON document must be passed as a string and cannot be
     * embedded in the requests.
     *
     * You can use this to customize the policy definition inherited from the
     * policy family. Policy rules specified here are merged into the inherited
     * policy definition.
     */
    policy_family_definition_overrides?: string;
    /**
     * ID of the policy family. The cluster policy's policy definition inherits
     * the policy family's policy definition.
     *
     * Cannot be used with `definition`. Use `policy_family_definition_overrides`
     * instead to customize the policy definition.
     */
    policy_family_id?: string;
    /**
     * The ID of the policy to update.
     */
    policy_id: string;
}

/**
 * Get entity
 */
export interface Get {
    /**
     * Canonical unique identifier for the cluster policy.
     */
    policy_id: string;
}

export interface GetPolicyFamilyRequest {
    policy_family_id: string;
}

/**
 * Get a cluster policy
 */
export interface List {
    /**
     * The cluster policy attribute to sort by. * `POLICY_CREATION_TIME` - Sort
     * result list by policy creation time. * `POLICY_NAME` - Sort result list by
     * policy name.
     */
    sort_column?: ListSortColumn;
    /**
     * The order in which the policies get listed. * `DESC` - Sort result list in
     * descending order. * `ASC` - Sort result list in ascending order.
     */
    sort_order?: ListSortOrder;
}

export interface ListPoliciesResponse {
    /**
     * List of policies.
     */
    policies?: Array<Policy>;
}

export interface ListPolicyFamiliesRequest {
    /**
     * The max number of policy families to return.
     */
    max_results?: number;
    /**
     * A token that can be used to get the next page of results.
     */
    page_token?: string;
}

export interface ListPolicyFamiliesResponse {
    /**
     * A token that can be used to get the next page of results. If not present,
     * there are no more results to show.
     */
    next_page_token?: string;
    /**
     * List of policy families.
     */
    policy_families: Array<PolicyFamily>;
}

export type ListSortColumn = "POLICY_CREATION_TIME" | "POLICY_NAME";

export type ListSortOrder = "ASC" | "DESC";

export interface Policy {
    /**
     * Creation time. The timestamp (in millisecond) when this Cluster Policy was
     * created.
     */
    created_at_timestamp?: number;
    /**
     * Creator user name. The field won't be included in the response if the user
     * has already been deleted.
     */
    creator_user_name?: string;
    /**
     * Policy definition document expressed in Databricks Cluster Policy
     * Definition Language.
     */
    definition?: string;
    /**
     * Additional human-readable description of the cluster policy.
     */
    description?: string;
    /**
     * If true, policy is a default policy created and managed by Databricks.
     * Default policies cannot be deleted, and their policy families cannot be
     * changed.
     */
    is_default?: boolean;
    /**
     * Max number of clusters per user that can be active using this policy. If
     * not present, there is no max limit.
     */
    max_clusters_per_user?: number;
    /**
     * Cluster Policy name requested by the user. This has to be unique. Length
     * must be between 1 and 100 characters.
     */
    name?: string;
    /**
     * Policy definition JSON document expressed in Databricks Policy Definition
     * Language. The JSON document must be passed as a string and cannot be
     * embedded in the requests.
     *
     * You can use this to customize the policy definition inherited from the
     * policy family. Policy rules specified here are merged into the inherited
     * policy definition.
     */
    policy_family_definition_overrides?: string;
    /**
     * ID of the policy family.
     */
    policy_family_id?: string;
    /**
     * Canonical unique identifier for the Cluster Policy.
     */
    policy_id?: string;
}

export interface PolicyFamily {
    /**
     * Policy definition document expressed in Databricks Cluster Policy
     * Definition Language.
     */
    definition: string;
    /**
     * Human-readable description of the purpose of the policy family.
     */
    description: string;
    /**
     * Name of the policy family.
     */
    name: string;
    /**
     * ID of the policy family.
     */
    policy_family_id: string;
}

/**
 * ID of the policy family.
 */

export interface EmptyResponse {}
