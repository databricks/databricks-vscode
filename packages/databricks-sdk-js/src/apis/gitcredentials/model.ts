/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateCredentials {
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are awsCodeCommit, azureDevOpsServices,
     */
    git_provider: string;
    /**
     * Git username.
     */
    git_username?: string;
    /**
     * The personal access token used to authenticate to the corresponding Git
     * provider.
     */
    personal_access_token?: string;
}

export interface CreateCredentialsResponse {
    /**
     * ID of the credential object in the workspace.
     */
    credential_id?: number;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are awsCodeCommit, azureDevOpsServices,
     */
    git_provider?: string;
    /**
     * Git username.
     */
    git_username?: string;
}

export interface CredentialInfo {
    /**
     * ID of the credential object in the workspace.
     */
    credential_id?: number;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are awsCodeCommit, azureDevOpsServices,
     */
    git_provider?: string;
    /**
     * Git username.
     */
    git_username?: string;
}

/**
 * Delete a credential
 */
export interface Delete {
    /**
     * The ID for the corresponding credential to access.
     */
    credential_id: number;
}

/**
 * Get a credential entry
 */
export interface Get {
    /**
     * The ID for the corresponding credential to access.
     */
    credential_id: number;
}

export interface GetCredentialsResponse {
    credentials?: Array<CredentialInfo>;
}

export interface UpdateCredentials {
    /**
     * The ID for the corresponding credential to access.
     */
    credential_id: number;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are awsCodeCommit, azureDevOpsServices,
     */
    git_provider?: string;
    /**
     * Git username.
     */
    git_username?: string;
    /**
     * The personal access token used to authenticate to the corresponding Git
     * provider.
     */
    personal_access_token?: string;
}

export interface EmptyResponse {}
