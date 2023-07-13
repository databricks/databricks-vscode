/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Custom App Integration, O Auth Enrollment, Published App Integration, Service Principal Secrets, etc.
 */

import {ApiClient} from "../../api-client";
import * as oauth2 from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

export class CustomAppIntegrationRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("CustomAppIntegration", method, message);
    }
}
export class CustomAppIntegrationError extends ApiError {
    constructor(method: string, message?: string) {
        super("CustomAppIntegration", method, message);
    }
}

/**
 * These APIs enable administrators to manage custom oauth app integrations,
 * which is required for adding/using Custom OAuth App Integration like Tableau
 * Cloud for Databricks in AWS cloud.
 *
 * **Note:** You can only add/use the OAuth custom application integrations when
 * OAuth enrollment status is enabled. For more details see
 * :method:OAuthEnrollment/create
 */
export class CustomAppIntegrationService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: oauth2.CreateCustomAppIntegration,
        @context context?: Context
    ): Promise<oauth2.CreateCustomAppIntegrationOutput> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/custom-app-integrations`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as oauth2.CreateCustomAppIntegrationOutput;
    }

    /**
     * Create Custom OAuth App Integration.
     *
     * Create Custom OAuth App Integration.
     *
     * You can retrieve the custom oauth app integration via
     * :method:CustomAppIntegration/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: oauth2.CreateCustomAppIntegration,
        @context context?: Context
    ): Promise<oauth2.CreateCustomAppIntegrationOutput> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: oauth2.DeleteCustomAppIntegrationRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/custom-app-integrations/${request.integration_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete Custom OAuth App Integration.
     *
     * Delete an existing Custom OAuth App Integration. You can retrieve the
     * custom oauth app integration via :method:CustomAppIntegration/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: oauth2.DeleteCustomAppIntegrationRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: oauth2.GetCustomAppIntegrationRequest,
        @context context?: Context
    ): Promise<oauth2.GetCustomAppIntegrationOutput> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/custom-app-integrations/${request.integration_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as oauth2.GetCustomAppIntegrationOutput;
    }

    /**
     * Get OAuth Custom App Integration.
     *
     * Gets the Custom OAuth App Integration for the given integration id.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: oauth2.GetCustomAppIntegrationRequest,
        @context context?: Context
    ): Promise<oauth2.GetCustomAppIntegrationOutput> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<oauth2.GetCustomAppIntegrationsOutput> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/custom-app-integrations`;
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as oauth2.GetCustomAppIntegrationsOutput;
    }

    /**
     * Get custom oauth app integrations.
     *
     * Get the list of custom oauth app integrations for the specified Databricks
     * account
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<oauth2.GetCustomAppIntegrationOutput> {
        const response = (await this._list(context)).apps;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: oauth2.UpdateCustomAppIntegration,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/custom-app-integrations/${request.integration_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Updates Custom OAuth App Integration.
     *
     * Updates an existing custom OAuth App Integration. You can retrieve the
     * custom oauth app integration via :method:CustomAppIntegration/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: oauth2.UpdateCustomAppIntegration,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._update(request, context);
    }
}

export class OAuthEnrollmentRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("OAuthEnrollment", method, message);
    }
}
export class OAuthEnrollmentError extends ApiError {
    constructor(method: string, message?: string) {
        super("OAuthEnrollment", method, message);
    }
}

/**
 * These APIs enable administrators to enroll OAuth for their accounts, which is
 * required for adding/using any OAuth published/custom application integration.
 *
 * **Note:** Your account must be on the E2 version to use these APIs, this is
 * because OAuth is only supported on the E2 version.
 */
export class OAuthEnrollmentService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: oauth2.CreateOAuthEnrollment,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/enrollment`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Create OAuth Enrollment request.
     *
     * Create an OAuth Enrollment request to enroll OAuth for this account and
     * optionally enable the OAuth integration for all the partner applications
     * in the account.
     *
     * The parter applications are: - Power BI - Tableau Desktop - Databricks CLI
     *
     * The enrollment is executed asynchronously, so the API will return 204
     * immediately. The actual enrollment take a few minutes, you can check the
     * status via API :method:OAuthEnrollment/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: oauth2.CreateOAuthEnrollment,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        @context context?: Context
    ): Promise<oauth2.OAuthEnrollmentStatus> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/enrollment`;
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as oauth2.OAuthEnrollmentStatus;
    }

    /**
     * Get OAuth enrollment status.
     *
     * Gets the OAuth enrollment status for this Account.
     *
     * You can only add/use the OAuth published/custom application integrations
     * when OAuth enrollment status is enabled.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        @context context?: Context
    ): Promise<oauth2.OAuthEnrollmentStatus> {
        return await this._get(context);
    }
}

export class PublishedAppIntegrationRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("PublishedAppIntegration", method, message);
    }
}
export class PublishedAppIntegrationError extends ApiError {
    constructor(method: string, message?: string) {
        super("PublishedAppIntegration", method, message);
    }
}

/**
 * These APIs enable administrators to manage published oauth app integrations,
 * which is required for adding/using Published OAuth App Integration like
 * Tableau Cloud for Databricks in AWS cloud.
 *
 * **Note:** You can only add/use the OAuth published application integrations
 * when OAuth enrollment status is enabled. For more details see
 * :method:OAuthEnrollment/create
 */
export class PublishedAppIntegrationService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: oauth2.CreatePublishedAppIntegration,
        @context context?: Context
    ): Promise<oauth2.CreatePublishedAppIntegrationOutput> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/published-app-integrations`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as oauth2.CreatePublishedAppIntegrationOutput;
    }

    /**
     * Create Published OAuth App Integration.
     *
     * Create Published OAuth App Integration.
     *
     * You can retrieve the published oauth app integration via
     * :method:PublishedAppIntegration/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: oauth2.CreatePublishedAppIntegration,
        @context context?: Context
    ): Promise<oauth2.CreatePublishedAppIntegrationOutput> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: oauth2.DeletePublishedAppIntegrationRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/published-app-integrations/${request.integration_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete Published OAuth App Integration.
     *
     * Delete an existing Published OAuth App Integration. You can retrieve the
     * published oauth app integration via :method:PublishedAppIntegration/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: oauth2.DeletePublishedAppIntegrationRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: oauth2.GetPublishedAppIntegrationRequest,
        @context context?: Context
    ): Promise<oauth2.GetPublishedAppIntegrationOutput> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/published-app-integrations/${request.integration_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as oauth2.GetPublishedAppIntegrationOutput;
    }

    /**
     * Get OAuth Published App Integration.
     *
     * Gets the Published OAuth App Integration for the given integration id.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: oauth2.GetPublishedAppIntegrationRequest,
        @context context?: Context
    ): Promise<oauth2.GetPublishedAppIntegrationOutput> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<oauth2.GetPublishedAppIntegrationsOutput> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/published-app-integrations`;
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as oauth2.GetPublishedAppIntegrationsOutput;
    }

    /**
     * Get published oauth app integrations.
     *
     * Get the list of published oauth app integrations for the specified
     * Databricks account
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<oauth2.GetPublishedAppIntegrationOutput> {
        const response = (await this._list(context)).apps;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: oauth2.UpdatePublishedAppIntegration,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/oauth2/published-app-integrations/${request.integration_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Updates Published OAuth App Integration.
     *
     * Updates an existing published OAuth App Integration. You can retrieve the
     * published oauth app integration via :method:PublishedAppIntegration/get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: oauth2.UpdatePublishedAppIntegration,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._update(request, context);
    }
}

export class ServicePrincipalSecretsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ServicePrincipalSecrets", method, message);
    }
}
export class ServicePrincipalSecretsError extends ApiError {
    constructor(method: string, message?: string) {
        super("ServicePrincipalSecrets", method, message);
    }
}

/**
 * These APIs enable administrators to manage service principal secrets.
 *
 * You can use the generated secrets to obtain OAuth access tokens for a service
 * principal, which can then be used to access Databricks Accounts and Workspace
 * APIs. For more information, see [Authentication using OAuth tokens for service
 * principals],
 *
 * In addition, the generated secrets can be used to configure the Databricks
 * Terraform Provider to authenticate with the service principal. For more
 * information, see [Databricks Terraform Provider].
 *
 * [Authentication using OAuth tokens for service principals]: https://docs.databricks.com/dev-tools/authentication-oauth.html
 * [Databricks Terraform Provider]: https://github.com/databricks/terraform-provider-databricks/blob/master/docs/index.md#authenticating-with-service-principal
 */
export class ServicePrincipalSecretsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: oauth2.CreateServicePrincipalSecretRequest,
        @context context?: Context
    ): Promise<oauth2.CreateServicePrincipalSecretResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/servicePrincipals/${request.service_principal_id}/credentials/secrets`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as oauth2.CreateServicePrincipalSecretResponse;
    }

    /**
     * Create service principal secret.
     *
     * Create a secret for the given service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: oauth2.CreateServicePrincipalSecretRequest,
        @context context?: Context
    ): Promise<oauth2.CreateServicePrincipalSecretResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: oauth2.DeleteServicePrincipalSecretRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/servicePrincipals/${request.service_principal_id}/credentials/secrets/${request.secret_id},`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete service principal secret.
     *
     * Delete a secret from the given service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: oauth2.DeleteServicePrincipalSecretRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: oauth2.ListServicePrincipalSecretsRequest,
        @context context?: Context
    ): Promise<oauth2.ListServicePrincipalSecretsResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/servicePrincipals/${request.service_principal_id}/credentials/secrets`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as oauth2.ListServicePrincipalSecretsResponse;
    }

    /**
     * List service principal secrets.
     *
     * List all secrets associated with the given service principal. This
     * operation only returns information about the secrets themselves and does
     * not include the secret values.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: oauth2.ListServicePrincipalSecretsRequest,
        @context context?: Context
    ): AsyncIterable<oauth2.SecretInfo> {
        const response = (await this._list(request, context)).secrets;
        for (const v of response || []) {
            yield v;
        }
    }
}
