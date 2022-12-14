/* eslint-disable @typescript-eslint/naming-convention */
import {
    CredentialProvider,
    fromAzureCli,
    fromConfigFile,
    fromToken,
} from "@databricks/databricks-sdk";

export type AuthType = "azure-cli" | "gcloud-cli" | "oauth" | "profile" | "pat";

export abstract class AuthProvider {
    constructor(
        private readonly _host: URL,
        private readonly _authType: AuthType
    ) {}

    get host(): URL {
        return this._host;
    }

    get authType(): AuthType {
        return this._authType;
    }

    /**
     * Used to display the auth method in the UI
     */
    abstract describe(): string;
    abstract toJSON(): Record<string, unknown>;
    abstract getEnvVars(): {[key: string]: string};
    abstract getCredentialProvider(): CredentialProvider;

    static fromJSON(json: Record<string, any>): AuthProvider {
        const url = json.url instanceof URL ? json.url : new URL(json.host);
        if (!url) {
            throw new Error("Missing host");
        }

        if (!json.authType) {
            throw new Error("Missing authType");
        }

        switch (json.authType) {
            case "azure":
                return new AzureCliAuthProvider(url);
            case "profile":
                if (!json.profile) {
                    throw new Error("Missing profile");
                }
                return new ProfileAuthProvider(url, json.profile);
            case "pat":
                if (!json.token) {
                    throw new Error("Missing token");
                }
                return new TokenAuthProvider(url, json.token);
            default:
                throw new Error(`Unknown auth type: ${json.authType}`);
        }
    }
}

export class TokenAuthProvider extends AuthProvider {
    constructor(host: URL, private readonly token: string) {
        super(host, "pat");
    }

    describe(): string {
        return "Personal Access Token";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            token: this.token,
        };
    }

    getEnvVars(): {[key: string]: string} {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: this.authType,
            DATABRICKS_TOKEN: this.token,
        };
    }

    getCredentialProvider(): CredentialProvider {
        return fromToken(this.host, this.token);
    }
}

export class ProfileAuthProvider extends AuthProvider {
    constructor(host: URL, private readonly profile: string) {
        super(host, "profile");
    }

    describe(): string {
        return `Profile '${this.profile}'`;
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            profile: this.profile,
        };
    }

    getEnvVars(): {[key: string]: string} {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_CONFIG_PROFILE: this.profile,
        };
    }

    getCredentialProvider(): CredentialProvider {
        return fromConfigFile(this.profile);
    }
}

export class AzureCliAuthProvider extends AuthProvider {
    constructor(host: URL) {
        super(host, "azure-cli");
    }

    describe(): string {
        return "Azure CLI";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
        };
    }

    getEnvVars(): {[key: string]: string} {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: this.authType,
        };
    }

    getCredentialProvider(): CredentialProvider {
        return fromAzureCli(this.host);
    }
}
