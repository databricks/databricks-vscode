/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Account Ip Access Lists, Account Settings, Ip Access Lists, Token Management, Tokens, Workspace Conf, etc.
 */

import {ApiClient} from "../../api-client";
import * as settings from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types"
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context"
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";




export class AccountIpAccessListsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountIpAccessLists", method, message)
    }
}
export class AccountIpAccessListsError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountIpAccessLists", method, message)
    }
}

/**
* The Accounts IP Access List API enables account admins to configure IP access
* lists for access to the account console.
* 
* Account IP Access Lists affect web application access and REST API access to
* the account console and account APIs. If the feature is disabled for the
* account, all access is allowed for this account. There is support for allow
* lists (inclusion) and block lists (exclusion).
* 
* When a connection is attempted: 1. **First, all block lists are checked.** If
* the connection IP address matches any block list, the connection is rejected.
* 2. **If the connection was not rejected by block lists**, the IP address is
* compared with the allow lists.
* 
* If there is at least one allow list for the account, the connection is allowed
* only if the IP address matches an allow list. If there are no allow lists for
* the account, all IP addresses are allowed.
* 
* For all allow lists and block lists combined, the account supports a maximum
* of 1000 IP/CIDR values, where one CIDR counts as a single value.
* 
* After changes to the account-level IP access lists, it can take a few minutes
* for changes to take effect.
*/
export class AccountIpAccessListsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  settings.CreateIpAccessList,
            @context context?: Context
        ): Promise<
        
            settings.CreateIpAccessListResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            settings.CreateIpAccessListResponse
        
    )
        }    

        
        /**
        * Create access list.
    * 
    * Creates an IP access list for the account.
    * 
    * A list can be an allow list or a block list. See the top of this file for
    * a description of how the server treats allow lists and block lists at
    * runtime.
    * 
    * When creating or updating an IP access list:
    * 
    * * For all allow lists and block lists combined, the API supports a maximum
    * of 1000 IP/CIDR values, where one CIDR counts as a single value. Attempts
    * to exceed that number return error 400 with `error_code` value
    * `QUOTA_EXCEEDED`. * If the new list would block the calling user's current
    * IP, error 400 is returned with `error_code` value `INVALID_STATE`.
    * 
    * It can take a few minutes for the changes to take effect.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  settings.CreateIpAccessList,
            @context context?: Context
        ): Promise<
        
            settings.CreateIpAccessListResponse
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  settings.DeleteAccountIpAccessListRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete access list.
    * 
    * Deletes an IP access list, specified by its list ID.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  settings.DeleteAccountIpAccessListRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  settings.GetAccountIpAccessListRequest,
            @context context?: Context
        ): Promise<
        
            settings.GetIpAccessListResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            settings.GetIpAccessListResponse
        
    )
        }    

        
        /**
        * Get IP access list.
    * 
    * Gets an IP access list, specified by its list ID.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  settings.GetAccountIpAccessListRequest,
            @context context?: Context
        ): Promise<
        
            settings.GetIpAccessListResponse
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(
            @context context?: Context
        ): Promise<
        
            settings.GetIpAccessListsResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists`
            return (await this.client.request(
                path,
                "GET",
                undefined, 
                context
            ) as 
        
            settings.GetIpAccessListsResponse
        
    )
        }    

        
        /**
        * Get access lists.
    * 
    * Gets all IP access lists for the specified account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(
            @context context?: Context    
        ): AsyncIterable<settings.IpAccessListInfo> {
            
            const response = (await this._list( context)).ip_access_lists;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _replace(request:  settings.ReplaceIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace access list.
    * 
    * Replaces an IP access list, specified by its ID.
    * 
    * A list can include allow lists and block lists. See the top of this file
    * for a description of how the server treats allow lists and block lists at
    * run time. When replacing an IP access list: * For all allow lists and
    * block lists combined, the API supports a maximum of 1000 IP/CIDR values,
    * where one CIDR counts as a single value. Attempts to exceed that number
    * return error 400 with `error_code` value `QUOTA_EXCEEDED`. * If the
    * resulting list would block the calling user's current IP, error 400 is
    * returned with `error_code` value `INVALID_STATE`. It can take a few
    * minutes for the changes to take effect.
        */
        @withLogContext(ExposedLoggers.SDK)
        async replace(request:  settings.ReplaceIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._replace(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  settings.UpdateIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update access list.
    * 
    * Updates an existing IP access list, specified by its ID.
    * 
    * A list can include allow lists and block lists. See the top of this file
    * for a description of how the server treats allow lists and block lists at
    * run time.
    * 
    * When updating an IP access list:
    * 
    * * For all allow lists and block lists combined, the API supports a maximum
    * of 1000 IP/CIDR values, where one CIDR counts as a single value. Attempts
    * to exceed that number return error 400 with `error_code` value
    * `QUOTA_EXCEEDED`. * If the updated list would block the calling user's
    * current IP, error 400 is returned with `error_code` value `INVALID_STATE`.
    * 
    * It can take a few minutes for the changes to take effect.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  settings.UpdateIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class AccountSettingsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountSettings", method, message)
    }
}
export class AccountSettingsError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountSettings", method, message)
    }
}

/**
* The Personal Compute enablement setting lets you control which users can use
* the Personal Compute default policy to create compute resources. By default
* all users in all workspaces have access (ON), but you can change the setting
* to instead let individual workspaces configure access control (DELEGATE).
* 
* There is only one instance of this setting per account. Since this setting has
* a default value, this setting is present on all accounts even though it's
* never set on a given account. Deletion reverts the value of the setting back
* to the default value.
*/
export class AccountSettingsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _deletePersonalComputeSetting(request:  settings.DeletePersonalComputeSettingRequest,
            @context context?: Context
        ): Promise<
        
            settings.DeletePersonalComputeSettingResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/settings/types/dcp_acct_enable/names/default`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as 
        
            settings.DeletePersonalComputeSettingResponse
        
    )
        }    

        
        /**
        * Delete Personal Compute setting.
    * 
    * Reverts back the Personal Compute setting value to default (ON)
        */
        @withLogContext(ExposedLoggers.SDK)
        async deletePersonalComputeSetting(request:  settings.DeletePersonalComputeSettingRequest,
            @context context?: Context
        ): Promise<
        
            settings.DeletePersonalComputeSettingResponse
        
    >     
        {
            return await this._deletePersonalComputeSetting(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _readPersonalComputeSetting(request:  settings.ReadPersonalComputeSettingRequest,
            @context context?: Context
        ): Promise<
        
            settings.PersonalComputeSetting
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/settings/types/dcp_acct_enable/names/default`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            settings.PersonalComputeSetting
        
    )
        }    

        
        /**
        * Get Personal Compute setting.
    * 
    * Gets the value of the Personal Compute setting.
        */
        @withLogContext(ExposedLoggers.SDK)
        async readPersonalComputeSetting(request:  settings.ReadPersonalComputeSettingRequest,
            @context context?: Context
        ): Promise<
        
            settings.PersonalComputeSetting
        
    >     
        {
            return await this._readPersonalComputeSetting(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _updatePersonalComputeSetting(request:  settings.UpdatePersonalComputeSettingRequest,
            @context context?: Context
        ): Promise<
        
            settings.PersonalComputeSetting
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/settings/types/dcp_acct_enable/names/default`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as 
        
            settings.PersonalComputeSetting
        
    )
        }    

        
        /**
        * Update Personal Compute setting.
    * 
    * Updates the value of the Personal Compute setting.
        */
        @withLogContext(ExposedLoggers.SDK)
        async updatePersonalComputeSetting(request:  settings.UpdatePersonalComputeSettingRequest,
            @context context?: Context
        ): Promise<
        
            settings.PersonalComputeSetting
        
    >     
        {
            return await this._updatePersonalComputeSetting(request, context);
        }    
        
    
}

export class IpAccessListsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("IpAccessLists", method, message)
    }
}
export class IpAccessListsError extends ApiError {
    constructor(method: string, message?: string){
        super("IpAccessLists", method, message)
    }
}

/**
* IP Access List enables admins to configure IP access lists.
* 
* IP access lists affect web application access and REST API access to this
* workspace only. If the feature is disabled for a workspace, all access is
* allowed for this workspace. There is support for allow lists (inclusion) and
* block lists (exclusion).
* 
* When a connection is attempted: 1. **First, all block lists are checked.** If
* the connection IP address matches any block list, the connection is rejected.
* 2. **If the connection was not rejected by block lists**, the IP address is
* compared with the allow lists.
* 
* If there is at least one allow list for the workspace, the connection is
* allowed only if the IP address matches an allow list. If there are no allow
* lists for the workspace, all IP addresses are allowed.
* 
* For all allow lists and block lists combined, the workspace supports a maximum
* of 1000 IP/CIDR values, where one CIDR counts as a single value.
* 
* After changes to the IP access list feature, it can take a few minutes for
* changes to take effect.
*/
export class IpAccessListsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  settings.CreateIpAccessList,
            @context context?: Context
        ): Promise<
        
            settings.CreateIpAccessListResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/ip-access-lists"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            settings.CreateIpAccessListResponse
        
    )
        }    

        
        /**
        * Create access list.
    * 
    * Creates an IP access list for this workspace.
    * 
    * A list can be an allow list or a block list. See the top of this file for
    * a description of how the server treats allow lists and block lists at
    * runtime.
    * 
    * When creating or updating an IP access list:
    * 
    * * For all allow lists and block lists combined, the API supports a maximum
    * of 1000 IP/CIDR values, where one CIDR counts as a single value. Attempts
    * to exceed that number return error 400 with `error_code` value
    * `QUOTA_EXCEEDED`. * If the new list would block the calling user's current
    * IP, error 400 is returned with `error_code` value `INVALID_STATE`.
    * 
    * It can take a few minutes for the changes to take effect. **Note**: Your
    * new IP access list has no effect until you enable the feature. See
    * :method:workspaceconf/setStatus
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  settings.CreateIpAccessList,
            @context context?: Context
        ): Promise<
        
            settings.CreateIpAccessListResponse
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  settings.DeleteIpAccessListRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete access list.
    * 
    * Deletes an IP access list, specified by its list ID.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  settings.DeleteIpAccessListRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  settings.GetIpAccessListRequest,
            @context context?: Context
        ): Promise<
        
            settings.FetchIpAccessListResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            settings.FetchIpAccessListResponse
        
    )
        }    

        
        /**
        * Get access list.
    * 
    * Gets an IP access list, specified by its list ID.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  settings.GetIpAccessListRequest,
            @context context?: Context
        ): Promise<
        
            settings.FetchIpAccessListResponse
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(
            @context context?: Context
        ): Promise<
        
            settings.GetIpAccessListResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/ip-access-lists"
            return (await this.client.request(
                path,
                "GET",
                undefined, 
                context
            ) as 
        
            settings.GetIpAccessListResponse
        
    )
        }    

        
        /**
        * Get access lists.
    * 
    * Gets all IP access lists for the specified workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(
            @context context?: Context    
        ): AsyncIterable<settings.IpAccessListInfo> {
            
            const response = (await this._list( context)).ip_access_lists;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _replace(request:  settings.ReplaceIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace access list.
    * 
    * Replaces an IP access list, specified by its ID.
    * 
    * A list can include allow lists and block lists. See the top of this file
    * for a description of how the server treats allow lists and block lists at
    * run time. When replacing an IP access list: * For all allow lists and
    * block lists combined, the API supports a maximum of 1000 IP/CIDR values,
    * where one CIDR counts as a single value. Attempts to exceed that number
    * return error 400 with `error_code` value `QUOTA_EXCEEDED`. * If the
    * resulting list would block the calling user's current IP, error 400 is
    * returned with `error_code` value `INVALID_STATE`. It can take a few
    * minutes for the changes to take effect. Note that your resulting IP access
    * list has no effect until you enable the feature. See
    * :method:workspaceconf/setStatus.
        */
        @withLogContext(ExposedLoggers.SDK)
        async replace(request:  settings.ReplaceIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._replace(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  settings.UpdateIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update access list.
    * 
    * Updates an existing IP access list, specified by its ID.
    * 
    * A list can include allow lists and block lists. See the top of this file
    * for a description of how the server treats allow lists and block lists at
    * run time.
    * 
    * When updating an IP access list:
    * 
    * * For all allow lists and block lists combined, the API supports a maximum
    * of 1000 IP/CIDR values, where one CIDR counts as a single value. Attempts
    * to exceed that number return error 400 with `error_code` value
    * `QUOTA_EXCEEDED`. * If the updated list would block the calling user's
    * current IP, error 400 is returned with `error_code` value `INVALID_STATE`.
    * 
    * It can take a few minutes for the changes to take effect. Note that your
    * resulting IP access list has no effect until you enable the feature. See
    * :method:workspaceconf/setStatus.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  settings.UpdateIpAccessList,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class TokenManagementRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("TokenManagement", method, message)
    }
}
export class TokenManagementError extends ApiError {
    constructor(method: string, message?: string){
        super("TokenManagement", method, message)
    }
}

/**
* Enables administrators to get all tokens and delete tokens for other users.
* Admins can either get every token, get a specific token by ID, or get all
* tokens for a particular user.
*/
export class TokenManagementService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _createOboToken(request:  settings.CreateOboTokenRequest,
            @context context?: Context
        ): Promise<
        
            settings.CreateOboTokenResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/token-management/on-behalf-of/tokens"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            settings.CreateOboTokenResponse
        
    )
        }    

        
        /**
        * Create on-behalf token.
    * 
    * Creates a token on behalf of a service principal.
        */
        @withLogContext(ExposedLoggers.SDK)
        async createOboToken(request:  settings.CreateOboTokenRequest,
            @context context?: Context
        ): Promise<
        
            settings.CreateOboTokenResponse
        
    >     
        {
            return await this._createOboToken(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  settings.DeleteTokenManagementRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/token-management/tokens/${request.token_id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a token.
    * 
    * Deletes a token, specified by its ID.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  settings.DeleteTokenManagementRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  settings.GetTokenManagementRequest,
            @context context?: Context
        ): Promise<
        
            settings.TokenInfo
        
    > 
        
        {
                    
            const path = `/api/2.0/token-management/tokens/${request.token_id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            settings.TokenInfo
        
    )
        }    

        
        /**
        * Get token info.
    * 
    * Gets information about a token, specified by its ID.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  settings.GetTokenManagementRequest,
            @context context?: Context
        ): Promise<
        
            settings.TokenInfo
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  settings.ListTokenManagementRequest,
            @context context?: Context
        ): Promise<
        
            settings.ListTokensResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/token-management/tokens"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            settings.ListTokensResponse
        
    )
        }    

        
        /**
        * List all tokens.
    * 
    * Lists all tokens associated with the specified workspace or user.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: settings.ListTokenManagementRequest,
            @context context?: Context    
        ): AsyncIterable<settings.TokenInfo> {
            
            const response = (await this._list(request, context)).token_infos;
                        for (const v of response || []) {
                yield v;
            }
        }
    
}

export class TokensRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("Tokens", method, message)
    }
}
export class TokensError extends ApiError {
    constructor(method: string, message?: string){
        super("Tokens", method, message)
    }
}

/**
* The Token API allows you to create, list, and revoke tokens that can be used
* to authenticate and access Databricks REST APIs.
*/
export class TokensService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  settings.CreateTokenRequest,
            @context context?: Context
        ): Promise<
        
            settings.CreateTokenResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/token/create"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            settings.CreateTokenResponse
        
    )
        }    

        
        /**
        * Create a user token.
    * 
    * Creates and returns a token for a user. If this call is made through token
    * authentication, it creates a token with the same client ID as the
    * authenticated token. If the user's token quota is exceeded, this call
    * returns an error **QUOTA_EXCEEDED**.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  settings.CreateTokenRequest,
            @context context?: Context
        ): Promise<
        
            settings.CreateTokenResponse
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  settings.RevokeTokenRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = "/api/2.0/token/delete"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Revoke token.
    * 
    * Revokes an access token.
    * 
    * If a token with the specified ID is not valid, this call returns an error
    * **RESOURCE_DOES_NOT_EXIST**.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  settings.RevokeTokenRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(
            @context context?: Context
        ): Promise<
        
            settings.ListTokensResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/token/list"
            return (await this.client.request(
                path,
                "GET",
                undefined, 
                context
            ) as 
        
            settings.ListTokensResponse
        
    )
        }    

        
        /**
        * List tokens.
    * 
    * Lists all the valid tokens for a user-workspace pair.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(
            @context context?: Context    
        ): AsyncIterable<settings.TokenInfo> {
            
            const response = (await this._list( context)).token_infos;
                        for (const v of response || []) {
                yield v;
            }
        }
    
}

export class WorkspaceConfRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("WorkspaceConf", method, message)
    }
}
export class WorkspaceConfError extends ApiError {
    constructor(method: string, message?: string){
        super("WorkspaceConf", method, message)
    }
}

/**
* This API allows updating known workspace settings for advanced users.
*/
export class WorkspaceConfService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _getStatus(request:  settings.GetStatusRequest,
            @context context?: Context
        ): Promise<
        
            settings.WorkspaceConf
        
    > 
        
        {
                    
            const path = "/api/2.0/workspace-conf"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            settings.WorkspaceConf
        
    )
        }    

        
        /**
        * Check configuration status.
    * 
    * Gets the configuration status for a workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getStatus(request:  settings.GetStatusRequest,
            @context context?: Context
        ): Promise<
        
            settings.WorkspaceConf
        
    >     
        {
            return await this._getStatus(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _setStatus(request:  settings.WorkspaceConf,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = "/api/2.0/workspace-conf"
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Enable/disable features.
    * 
    * Sets the configuration status for a workspace, including enabling or
    * disabling it.
        */
        @withLogContext(ExposedLoggers.SDK)
        async setStatus(request:  settings.WorkspaceConf,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._setStatus(request, context);
        }    
        
    
}
