import type { Cli } from "../cli/Cli";
import { authToken } from "../cli/commands/auth";
import type { ProcessRunner } from "../../platform/process";
import { azureCliTokenProvider, type CredentialSources } from "./credentials";
import type { Connection } from "./ConnectionService";

export * from "./ApiClients";
export * from "./ClusterListClient";
export * from "./ConnectionService";
export * from "./credentials";
export * from "./hostMatching";
export * from "./notFound";
export * from "./pathValue";
export * from "./pipelineEvents";
export * from "./WorkspaceIds";
export * from "./Profiles";
export * from "./resolveConnection";

declare module "../../platform/commands" {
    interface Scopes {
        /** A signed-in workspace. */
        connection: Connection;
    }
}

/**
 * Where in-process credentials come from: the bundled CLI for U2M, `az` for
 * Azure CLI. `env` is the signed-out `childEnv`, which names the config file.
 */
export function credentialSources(deps: {
    readonly cli: Cli;
    readonly runner: ProcessRunner;
    readonly env: () => Record<string, string>;
}): CredentialSources {
    return {
        u2mToken: async (profile) => {
            const token = await authToken(deps.cli, profile, { env: deps.env() });
            return {
                value: token.value,
                expiry: token.expiry,
                ...(token.type ? { type: token.type } : {}),
            };
        },
        azureCliToken: (tenantId) =>
            azureCliTokenProvider(deps.runner, { tenantId, env: deps.env() }).token(),
    };
}
