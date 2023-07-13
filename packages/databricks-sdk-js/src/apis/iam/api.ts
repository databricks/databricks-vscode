/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Account Access Control, Account Access Control Proxy, Account Groups, Account Service Principals, Account Users, Current User, Groups, Permissions, Service Principals, Users, Workspace Assignment, etc.
 */

import {ApiClient} from "../../api-client";
import * as iam from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types"
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context"
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";




export class AccountAccessControlRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountAccessControl", method, message)
    }
}
export class AccountAccessControlError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountAccessControl", method, message)
    }
}

/**
* These APIs manage access rules on resources in an account. Currently, only
* grant rules are supported. A grant rule specifies a role assigned to a set of
* principals. A list of rules attached to a resource is called a rule set.
*/
export class AccountAccessControlService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _getAssignableRolesForResource(request:  iam.GetAssignableRolesForResourceRequest,
            @context context?: Context
        ): Promise<
        
            iam.GetAssignableRolesForResourceResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/access-control/assignable-roles`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.GetAssignableRolesForResourceResponse
        
    )
        }    

        
        /**
        * Get assignable roles for a resource.
    * 
    * Gets all the roles that can be granted on an account level resource. A
    * role is grantable if the rule set on the resource can contain an access
    * rule of the role.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getAssignableRolesForResource(request:  iam.GetAssignableRolesForResourceRequest,
            @context context?: Context
        ): Promise<
        
            iam.GetAssignableRolesForResourceResponse
        
    >     
        {
            return await this._getAssignableRolesForResource(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _getRuleSet(request:  iam.GetRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/access-control/rule-sets`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.RuleSetResponse
        
    )
        }    

        
        /**
        * Get a rule set.
    * 
    * Get a rule set by its name. A rule set is always attached to a resource
    * and contains a list of access rules on the said resource. Currently only a
    * default rule set for each resource is supported.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getRuleSet(request:  iam.GetRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    >     
        {
            return await this._getRuleSet(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _updateRuleSet(request:  iam.UpdateRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/preview/accounts/${config.accountId}/access-control/rule-sets`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as 
        
            iam.RuleSetResponse
        
    )
        }    

        
        /**
        * Update a rule set.
    * 
    * Replace the rules of a rule set. First, use get to read the current
    * version of the rule set before modifying it. This pattern helps prevent
    * conflicts between concurrent updates.
        */
        @withLogContext(ExposedLoggers.SDK)
        async updateRuleSet(request:  iam.UpdateRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    >     
        {
            return await this._updateRuleSet(request, context);
        }    
        
    
}

export class AccountAccessControlProxyRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountAccessControlProxy", method, message)
    }
}
export class AccountAccessControlProxyError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountAccessControlProxy", method, message)
    }
}

/**
* These APIs manage access rules on resources in an account. Currently, only
* grant rules are supported. A grant rule specifies a role assigned to a set of
* principals. A list of rules attached to a resource is called a rule set. A
* workspace must belong to an account for these APIs to work.
*/
export class AccountAccessControlProxyService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _getAssignableRolesForResource(request:  iam.GetAssignableRolesForResourceRequest,
            @context context?: Context
        ): Promise<
        
            iam.GetAssignableRolesForResourceResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/accounts/access-control/assignable-roles"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.GetAssignableRolesForResourceResponse
        
    )
        }    

        
        /**
        * Get assignable roles for a resource.
    * 
    * Gets all the roles that can be granted on an account-level resource. A
    * role is grantable if the rule set on the resource can contain an access
    * rule of the role.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getAssignableRolesForResource(request:  iam.GetAssignableRolesForResourceRequest,
            @context context?: Context
        ): Promise<
        
            iam.GetAssignableRolesForResourceResponse
        
    >     
        {
            return await this._getAssignableRolesForResource(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _getRuleSet(request:  iam.GetRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/accounts/access-control/rule-sets"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.RuleSetResponse
        
    )
        }    

        
        /**
        * Get a rule set.
    * 
    * Get a rule set by its name. A rule set is always attached to a resource
    * and contains a list of access rules on the said resource. Currently only a
    * default rule set for each resource is supported.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getRuleSet(request:  iam.GetRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    >     
        {
            return await this._getRuleSet(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _updateRuleSet(request:  iam.UpdateRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/accounts/access-control/rule-sets"
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as 
        
            iam.RuleSetResponse
        
    )
        }    

        
        /**
        * Update a rule set.
    * 
    * Replace the rules of a rule set. First, use a GET rule set request to read
    * the current version of the rule set before modifying it. This pattern
    * helps prevent conflicts between concurrent updates.
        */
        @withLogContext(ExposedLoggers.SDK)
        async updateRuleSet(request:  iam.UpdateRuleSetRequest,
            @context context?: Context
        ): Promise<
        
            iam.RuleSetResponse
        
    >     
        {
            return await this._updateRuleSet(request, context);
        }    
        
    
}

export class AccountGroupsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountGroups", method, message)
    }
}
export class AccountGroupsError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountGroups", method, message)
    }
}

/**
* Groups simplify identity management, making it easier to assign access to
* Databricks account, data, and other securable objects.
* 
* It is best practice to assign access to workspaces and access-control policies
* in Unity Catalog to groups, instead of to users individually. All Databricks
* account identities can be assigned as members of groups, and members inherit
* permissions that are assigned to their group.
*/
export class AccountGroupsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  iam.Group,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Groups`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            iam.Group
        
    )
        }    

        
        /**
        * Create a new group.
    * 
    * Creates a group in the Databricks account with a unique name, using the
    * supplied group details.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  iam.Group,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteAccountGroupRequest,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a group.
    * 
    * Deletes a group from the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteAccountGroupRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetAccountGroupRequest,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.Group
        
    )
        }    

        
        /**
        * Get group details.
    * 
    * Gets the information for a specific group in the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetAccountGroupRequest,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListAccountGroupsRequest,
            @context context?: Context
        ): Promise<
        
            iam.ListGroupsResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Groups`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ListGroupsResponse
        
    )
        }    

        
        /**
        * List group details.
    * 
    * Gets all details of the groups associated with the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListAccountGroupsRequest,
            @context context?: Context    
        ): AsyncIterable<iam.Group> {
            
            const response = (await this._list(request, context)).Resources;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _patch(request:  iam.PartialUpdate,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update group details.
    * 
    * Partially updates the details of a group.
        */
        @withLogContext(ExposedLoggers.SDK)
        async patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._patch(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.Group,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace a group.
    * 
    * Updates the details of a group by replacing the entire group entity.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.Group,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class AccountServicePrincipalsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountServicePrincipals", method, message)
    }
}
export class AccountServicePrincipalsError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountServicePrincipals", method, message)
    }
}

/**
* Identities for use with jobs, automated tools, and systems such as scripts,
* apps, and CI/CD platforms. Databricks recommends creating service principals
* to run production jobs or modify production data. If all processes that act on
* production data run with service principals, interactive users do not need any
* write, delete, or modify privileges in production. This eliminates the risk of
* a user overwriting production data by accident.
*/
export class AccountServicePrincipalsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/ServicePrincipals`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            iam.ServicePrincipal
        
    )
        }    

        
        /**
        * Create a service principal.
    * 
    * Creates a new service principal in the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteAccountServicePrincipalRequest,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a service principal.
    * 
    * Delete a single service principal in the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteAccountServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetAccountServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ServicePrincipal
        
    )
        }    

        
        /**
        * Get service principal details.
    * 
    * Gets the details for a single service principal define in the Databricks
    * account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetAccountServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListAccountServicePrincipalsRequest,
            @context context?: Context
        ): Promise<
        
            iam.ListServicePrincipalResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/ServicePrincipals`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ListServicePrincipalResponse
        
    )
        }    

        
        /**
        * List service principals.
    * 
    * Gets the set of service principals associated with a Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListAccountServicePrincipalsRequest,
            @context context?: Context    
        ): AsyncIterable<iam.ServicePrincipal> {
            
            const response = (await this._list(request, context)).Resources;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _patch(request:  iam.PartialUpdate,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update service principal details.
    * 
    * Partially updates the details of a single service principal in the
    * Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._patch(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.ServicePrincipal,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace service principal.
    * 
    * Updates the details of a single service principal.
    * 
    * This action replaces the existing service principal with the same name.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class AccountUsersRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("AccountUsers", method, message)
    }
}
export class AccountUsersError extends ApiError {
    constructor(method: string, message?: string){
        super("AccountUsers", method, message)
    }
}

/**
* User identities recognized by Databricks and represented by email addresses.
* 
* Databricks recommends using SCIM provisioning to sync users and groups
* automatically from your identity provider to your Databricks account. SCIM
* streamlines onboarding a new employee or team by using your identity provider
* to create users and groups in Databricks account and give them the proper
* level of access. When a user leaves your organization or no longer needs
* access to Databricks account, admins can terminate the user in your identity
* provider and that user’s account will also be removed from Databricks
* account. This ensures a consistent offboarding process and prevents
* unauthorized users from accessing sensitive data.
*/
export class AccountUsersService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  iam.User,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Users`
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            iam.User
        
    )
        }    

        
        /**
        * Create a new user.
    * 
    * Creates a new user in the Databricks account. This new user will also be
    * added to the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  iam.User,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteAccountUserRequest,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a user.
    * 
    * Deletes a user. Deleting a user from a Databricks account also removes
    * objects associated with the user.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteAccountUserRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetAccountUserRequest,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.User
        
    )
        }    

        
        /**
        * Get user details.
    * 
    * Gets information for a specific user in Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetAccountUserRequest,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListAccountUsersRequest,
            @context context?: Context
        ): Promise<
        
            iam.ListUsersResponse
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Users`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ListUsersResponse
        
    )
        }    

        
        /**
        * List users.
    * 
    * Gets details for all the users associated with a Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListAccountUsersRequest,
            @context context?: Context    
        ): AsyncIterable<iam.User> {
            
            const response = (await this._list(request, context)).Resources;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _patch(request:  iam.PartialUpdate,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update user details.
    * 
    * Partially updates a user resource by applying the supplied operations on
    * specific user attributes.
        */
        @withLogContext(ExposedLoggers.SDK)
        async patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._patch(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.User,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace a user.
    * 
    * Replaces a user's information with the data supplied in request.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.User,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class CurrentUserRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("CurrentUser", method, message)
    }
}
export class CurrentUserError extends ApiError {
    constructor(method: string, message?: string){
        super("CurrentUser", method, message)
    }
}

/**
* This API allows retrieving information about currently authenticated user or
* service principal.
*/
export class CurrentUserService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _me(
            @context context?: Context
        ): Promise<
        
            iam.User
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/Me"
            return (await this.client.request(
                path,
                "GET",
                undefined, 
                context
            ) as 
        
            iam.User
        
    )
        }    

        
        /**
        * Get current user info.
    * 
    * Get details about the current method caller's identity.
        */
        @withLogContext(ExposedLoggers.SDK)
        async me(
            @context context?: Context
        ): Promise<
        
            iam.User
        
    >     
        {
            return await this._me( context);
        }    
        
    
}

export class GroupsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("Groups", method, message)
    }
}
export class GroupsError extends ApiError {
    constructor(method: string, message?: string){
        super("Groups", method, message)
    }
}

/**
* Groups simplify identity management, making it easier to assign access to
* Databricks workspace, data, and other securable objects.
* 
* It is best practice to assign access to workspaces and access-control policies
* in Unity Catalog to groups, instead of to users individually. All Databricks
* workspace identities can be assigned as members of groups, and members inherit
* permissions that are assigned to their group.
*/
export class GroupsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  iam.Group,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/Groups"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            iam.Group
        
    )
        }    

        
        /**
        * Create a new group.
    * 
    * Creates a group in the Databricks workspace with a unique name, using the
    * supplied group details.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  iam.Group,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteGroupRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a group.
    * 
    * Deletes a group from the Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteGroupRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetGroupRequest,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.Group
        
    )
        }    

        
        /**
        * Get group details.
    * 
    * Gets the information for a specific group in the Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetGroupRequest,
            @context context?: Context
        ): Promise<
        
            iam.Group
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListGroupsRequest,
            @context context?: Context
        ): Promise<
        
            iam.ListGroupsResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/Groups"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ListGroupsResponse
        
    )
        }    

        
        /**
        * List group details.
    * 
    * Gets all details of the groups associated with the Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListGroupsRequest,
            @context context?: Context    
        ): AsyncIterable<iam.Group> {
            
            const response = (await this._list(request, context)).Resources;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update group details.
    * 
    * Partially updates the details of a group.
        */
        @withLogContext(ExposedLoggers.SDK)
        async patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._patch(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.Group,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace a group.
    * 
    * Updates the details of a group by replacing the entire group entity.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.Group,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class PermissionsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("Permissions", method, message)
    }
}
export class PermissionsError extends ApiError {
    constructor(method: string, message?: string){
        super("Permissions", method, message)
    }
}

/**
* Permissions API are used to create read, write, edit, update and manage access
* for various users on different objects and endpoints.
*/
export class PermissionsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetPermissionRequest,
            @context context?: Context
        ): Promise<
        
            iam.ObjectPermissions
        
    > 
        
        {
                    
            const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ObjectPermissions
        
    )
        }    

        
        /**
        * Get object permissions.
    * 
    * Gets the permission of an object. Objects can inherit permissions from
    * their parent objects or root objects.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetPermissionRequest,
            @context context?: Context
        ): Promise<
        
            iam.ObjectPermissions
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _getPermissionLevels(request:  iam.GetPermissionLevelsRequest,
            @context context?: Context
        ): Promise<
        
            iam.GetPermissionLevelsResponse
        
    > 
        
        {
                    
            const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}/permissionLevels`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.GetPermissionLevelsResponse
        
    )
        }    

        
        /**
        * Get permission levels.
    * 
    * Gets the permission levels that a user can have on an object.
        */
        @withLogContext(ExposedLoggers.SDK)
        async getPermissionLevels(request:  iam.GetPermissionLevelsRequest,
            @context context?: Context
        ): Promise<
        
            iam.GetPermissionLevelsResponse
        
    >     
        {
            return await this._getPermissionLevels(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _set(request:  iam.PermissionsRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Set permissions.
    * 
    * Sets permissions on object. Objects can inherit permissions from their
    * parent objects and root objects.
        */
        @withLogContext(ExposedLoggers.SDK)
        async set(request:  iam.PermissionsRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._set(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.PermissionsRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update permission.
    * 
    * Updates the permissions on an object.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.PermissionsRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class ServicePrincipalsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("ServicePrincipals", method, message)
    }
}
export class ServicePrincipalsError extends ApiError {
    constructor(method: string, message?: string){
        super("ServicePrincipals", method, message)
    }
}

/**
* Identities for use with jobs, automated tools, and systems such as scripts,
* apps, and CI/CD platforms. Databricks recommends creating service principals
* to run production jobs or modify production data. If all processes that act on
* production data run with service principals, interactive users do not need any
* write, delete, or modify privileges in production. This eliminates the risk of
* a user overwriting production data by accident.
*/
export class ServicePrincipalsService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/ServicePrincipals"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            iam.ServicePrincipal
        
    )
        }    

        
        /**
        * Create a service principal.
    * 
    * Creates a new service principal in the Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a service principal.
    * 
    * Delete a single service principal in the Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ServicePrincipal
        
    )
        }    

        
        /**
        * Get service principal details.
    * 
    * Gets the details for a single service principal define in the Databricks
    * workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetServicePrincipalRequest,
            @context context?: Context
        ): Promise<
        
            iam.ServicePrincipal
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListServicePrincipalsRequest,
            @context context?: Context
        ): Promise<
        
            iam.ListServicePrincipalResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/ServicePrincipals"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ListServicePrincipalResponse
        
    )
        }    

        
        /**
        * List service principals.
    * 
    * Gets the set of service principals associated with a Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListServicePrincipalsRequest,
            @context context?: Context    
        ): AsyncIterable<iam.ServicePrincipal> {
            
            const response = (await this._list(request, context)).Resources;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update service principal details.
    * 
    * Partially updates the details of a single service principal in the
    * Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._patch(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace service principal.
    * 
    * Updates the details of a single service principal.
    * 
    * This action replaces the existing service principal with the same name.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.ServicePrincipal,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class UsersRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("Users", method, message)
    }
}
export class UsersError extends ApiError {
    constructor(method: string, message?: string){
        super("Users", method, message)
    }
}

/**
* User identities recognized by Databricks and represented by email addresses.
* 
* Databricks recommends using SCIM provisioning to sync users and groups
* automatically from your identity provider to your Databricks workspace. SCIM
* streamlines onboarding a new employee or team by using your identity provider
* to create users and groups in Databricks workspace and give them the proper
* level of access. When a user leaves your organization or no longer needs
* access to Databricks workspace, admins can terminate the user in your identity
* provider and that user’s account will also be removed from Databricks
* workspace. This ensures a consistent offboarding process and prevents
* unauthorized users from accessing sensitive data.
*/
export class UsersService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _create(request:  iam.User,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/Users"
            return (await this.client.request(
                path,
                "POST",
                request, 
                context
            ) as 
        
            iam.User
        
    )
        }    

        
        /**
        * Create a new user.
    * 
    * Creates a new user in the Databricks workspace. This new user will also be
    * added to the Databricks account.
        */
        @withLogContext(ExposedLoggers.SDK)
        async create(request:  iam.User,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    >     
        {
            return await this._create(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteUserRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete a user.
    * 
    * Deletes a user. Deleting a user from a Databricks workspace also removes
    * objects associated with the user.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteUserRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetUserRequest,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.User
        
    )
        }    

        
        /**
        * Get user details.
    * 
    * Gets information for a specific user in Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetUserRequest,
            @context context?: Context
        ): Promise<
        
            iam.User
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListUsersRequest,
            @context context?: Context
        ): Promise<
        
            iam.ListUsersResponse
        
    > 
        
        {
                    
            const path = "/api/2.0/preview/scim/v2/Users"
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.ListUsersResponse
        
    )
        }    

        
        /**
        * List users.
    * 
    * Gets details for all the users associated with a Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListUsersRequest,
            @context context?: Context    
        ): AsyncIterable<iam.User> {
            
            const response = (await this._list(request, context)).Resources;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "PATCH",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Update user details.
    * 
    * Partially updates a user resource by applying the supplied operations on
    * specific user attributes.
        */
        @withLogContext(ExposedLoggers.SDK)
        async patch(request:  iam.PartialUpdate,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._patch(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.User,
            @context context?: Context
        ): Promise<
        EmptyResponse
    > 
        
        {
                    
            const path = `/api/2.0/preview/scim/v2/Users/${request.id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Replace a user.
    * 
    * Replaces a user's information with the data supplied in request.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.User,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}

export class WorkspaceAssignmentRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string){
        super("WorkspaceAssignment", method, message)
    }
}
export class WorkspaceAssignmentError extends ApiError {
    constructor(method: string, message?: string){
        super("WorkspaceAssignment", method, message)
    }
}

/**
* The Workspace Permission Assignment API allows you to manage workspace
* permissions for principals in your account.
*/
export class WorkspaceAssignmentService {
    constructor(readonly client: ApiClient){}

        @withLogContext(ExposedLoggers.SDK)
        private async _delete(request:  iam.DeleteWorkspaceAssignmentRequest,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/permissionassignments/principals/${request.principal_id}`
            return (await this.client.request(
                path,
                "DELETE",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Delete permissions assignment.
    * 
    * Deletes the workspace permissions assignment in a given account and
    * workspace for the specified principal.
        */
        @withLogContext(ExposedLoggers.SDK)
        async delete(request:  iam.DeleteWorkspaceAssignmentRequest,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._delete(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _get(request:  iam.GetWorkspaceAssignmentRequest,
            @context context?: Context
        ): Promise<
        
            iam.WorkspacePermissions
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/permissionassignments/permissions`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.WorkspacePermissions
        
    )
        }    

        
        /**
        * List workspace permissions.
    * 
    * Get an array of workspace permissions for the specified account and
    * workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async get(request:  iam.GetWorkspaceAssignmentRequest,
            @context context?: Context
        ): Promise<
        
            iam.WorkspacePermissions
        
    >     
        {
            return await this._get(request, context);
        }    
        
    

        @withLogContext(ExposedLoggers.SDK)
        private async _list(request:  iam.ListWorkspaceAssignmentRequest,
            @context context?: Context
        ): Promise<
        
            iam.PermissionAssignments
        
    > 
        
        {
            
            const config = this.client.config;
            await config.ensureResolved();
            if (!config.accountId || !config.isAccountClient()) {
                throw new Error("invalid Databricks Account configuration");
            }
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/permissionassignments`
            return (await this.client.request(
                path,
                "GET",
                request, 
                context
            ) as 
        
            iam.PermissionAssignments
        
    )
        }    

        
        /**
        * Get permission assignments.
    * 
    * Get the permission assignments for the specified Databricks account and
    * Databricks workspace.
        */
        @withLogContext(ExposedLoggers.SDK)
        async *list(request: iam.ListWorkspaceAssignmentRequest,
            @context context?: Context    
        ): AsyncIterable<iam.PermissionAssignment> {
            
            const response = (await this._list(request, context)).permission_assignments;
                        for (const v of response || []) {
                yield v;
            }
        }
    

        @withLogContext(ExposedLoggers.SDK)
        private async _update(request:  iam.UpdateWorkspaceAssignments,
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
            
                    
            const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/permissionassignments/principals/${request.principal_id}`
            return (await this.client.request(
                path,
                "PUT",
                request, 
                context
            ) as EmptyResponse)
        }    

        
        /**
        * Create or update permissions assignment.
    * 
    * Creates or updates the workspace permissions assignment in a given account
    * and workspace for the specified principal.
        */
        @withLogContext(ExposedLoggers.SDK)
        async update(request:  iam.UpdateWorkspaceAssignments,
            @context context?: Context
        ): Promise<
        EmptyResponse
    >     
        {
            return await this._update(request, context);
        }    
        
    
}
