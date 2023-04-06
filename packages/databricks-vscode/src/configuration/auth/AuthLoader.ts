import {normalizeHost} from "../../utils/urlUtils";
import {AuthType, AuthProvider} from "./AuthProvider";
import {AzureAuthProvider} from "./AzureAuthProvider";
import {BricksCliAuthProvider} from "./BricksCliAuthProvider";
import {ProfileAuthProvider} from "./ProfileAuthProvider";

export class AuthLoader {
    static fromJSON(
        json: Record<string, any>,
        bricksPath: string
    ): AuthProvider {
        const host =
            json.host instanceof URL
                ? json.host
                : normalizeHost(json.host as string);
        if (!host) {
            throw new Error("Missing host");
        }

        if (!json.authType) {
            throw new Error("Missing authType");
        }

        switch (json.authType as AuthType) {
            case "azure-cli":
                return new AzureAuthProvider(host, json.tenantId, json.appId);

            case "bricks-cli":
                return new BricksCliAuthProvider(host, bricksPath);

            case "profile":
                if (!json.profile) {
                    throw new Error("Missing profile");
                }
                return new ProfileAuthProvider(host, json.profile);

            default:
                throw new Error(`Unknown auth type: ${json.authType}`);
        }
    }
}
