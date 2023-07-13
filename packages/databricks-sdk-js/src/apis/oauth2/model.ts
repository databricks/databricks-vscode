/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateCustomAppIntegration {
    
	/**
    * indicates if an oauth client-secret should be generated
	*/
	confidential?: boolean;
	/**
    * name of the custom oauth app
	*/
	name: string;
	/**
    * List of oauth redirect urls
	*/
	redirect_urls: Array<string>;
	/**
    * Token access policy
	*/
	token_access_policy?: TokenAccessPolicy;
}

export interface CreateCustomAppIntegrationOutput {
    
	/**
    * oauth client-id generated by the Databricks
	*/
	client_id?: string;
	/**
    * oauth client-secret generated by the Databricks if this is a confidential
    * oauth app client-secret will be generated.
	*/
	client_secret?: string;
	/**
    * unique integration id for the custom oauth app
	*/
	integration_id?: string;
}

export interface CreateOAuthEnrollment {
    
	/**
    * If true, enable OAuth for all the published applications in the account.
	*/
	enable_all_published_apps?: boolean;
}

export interface CreatePublishedAppIntegration {
    
	/**
    * app_id of the oauth published app integration. For example power-bi,
    * tableau-deskop
	*/
	app_id?: string;
	/**
    * Token access policy
	*/
	token_access_policy?: TokenAccessPolicy;
}

export interface CreatePublishedAppIntegrationOutput {
    
	/**
    * unique integration id for the published oauth app
	*/
	integration_id?: string;
}

/**
* Create service principal secret
*/
export interface CreateServicePrincipalSecretRequest {
    
	/**
    * The service principal ID.
	*/
	service_principal_id: number;
}

export interface CreateServicePrincipalSecretResponse {
    
	/**
    * UTC time when the secret was created
	*/
	create_time?: string;
	/**
    * ID of the secret
	*/
	id?: string;
	/**
    * Secret Value
	*/
	secret?: string;
	/**
    * Secret Hash
	*/
	secret_hash?: string;
	/**
    * Status of the secret
	*/
	status?: string;
	/**
    * UTC time when the secret was updated
	*/
	update_time?: string;
}

/**
* Delete Custom OAuth App Integration
*/
export interface DeleteCustomAppIntegrationRequest {
    
	/**
    * The oauth app integration ID.
	*/
	integration_id: string;
}

/**
* Delete Published OAuth App Integration
*/
export interface DeletePublishedAppIntegrationRequest {
    
	/**
    * The oauth app integration ID.
	*/
	integration_id: string;
}

/**
* Delete service principal secret
*/
export interface DeleteServicePrincipalSecretRequest {
    
	/**
    * The secret ID.
	*/
	secret_id: string;
	/**
    * The service principal ID.
	*/
	service_principal_id: number;
}

export interface GetCustomAppIntegrationOutput {
    
	/**
    * oauth client id of the custom oauth app
	*/
	client_id?: string;
	/**
    * indicates if an oauth client-secret should be generated
	*/
	confidential?: boolean;
	/**
    * ID of this custom app
	*/
	integration_id?: string;
	/**
    * name of the custom oauth app
	*/
	name?: string;
	/**
    * List of oauth redirect urls
	*/
	redirect_urls?: Array<string>;
	/**
    * Token access policy
	*/
	token_access_policy?: TokenAccessPolicy;
}

/**
* Get OAuth Custom App Integration
*/
export interface GetCustomAppIntegrationRequest {
    
	/**
    * The oauth app integration ID.
	*/
	integration_id: string;
}

export interface GetCustomAppIntegrationsOutput {
    
	/**
    * Array of Custom OAuth App Integrations defined for the account.
	*/
	apps?: Array<GetCustomAppIntegrationOutput>;
}

export interface GetPublishedAppIntegrationOutput {
    
	/**
    * app-id of the published app integration
	*/
	app_id?: string;
	/**
    * unique integration id for the published oauth app
	*/
	integration_id?: string;
	/**
    * name of the published oauth app
	*/
	name?: string;
	/**
    * Token access policy
	*/
	token_access_policy?: TokenAccessPolicy;
}

/**
* Get OAuth Published App Integration
*/
export interface GetPublishedAppIntegrationRequest {
    
	/**
    * The oauth app integration ID.
	*/
	integration_id: string;
}

export interface GetPublishedAppIntegrationsOutput {
    
	/**
    * Array of Published OAuth App Integrations defined for the account.
	*/
	apps?: Array<GetPublishedAppIntegrationOutput>;
}

/**
* List service principal secrets
*/
export interface ListServicePrincipalSecretsRequest {
    
	/**
    * The service principal ID.
	*/
	service_principal_id: number;
}

export interface ListServicePrincipalSecretsResponse {
    
	/**
    * List of the secrets
	*/
	secrets?: Array<SecretInfo>;
}

export interface OAuthEnrollmentStatus {
    
	/**
    * Is OAuth enrolled for the account.
	*/
	is_enabled?: boolean;
}

export interface SecretInfo {
    
	/**
    * UTC time when the secret was created
	*/
	create_time?: string;
	/**
    * ID of the secret
	*/
	id?: string;
	/**
    * Secret Hash
	*/
	secret_hash?: string;
	/**
    * Status of the secret
	*/
	status?: string;
	/**
    * UTC time when the secret was updated
	*/
	update_time?: string;
}

export interface TokenAccessPolicy {
    
	/**
    * access token time to live in minutes
	*/
	access_token_ttl_in_minutes?: number;
	/**
    * refresh token time to live in minutes
	*/
	refresh_token_ttl_in_minutes?: number;
}

export interface UpdateCustomAppIntegration {
    
	/**
    * The oauth app integration ID.
	*/
	integration_id: string;
	/**
    * List of oauth redirect urls to be updated in the custom oauth app
    * integration
	*/
	redirect_urls?: Array<string>;
	/**
    * Token access policy to be updated in the custom oauth app integration
	*/
	token_access_policy?: TokenAccessPolicy;
}

export interface UpdatePublishedAppIntegration {
    
	/**
    * The oauth app integration ID.
	*/
	integration_id: string;
	/**
    * Token access policy to be updated in the published oauth app integration
	*/
	token_access_policy?: TokenAccessPolicy;
}

