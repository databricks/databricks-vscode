import {RequestVisitor, Config, CredentialProvider} from "./Config";

export class PatCredentials implements CredentialProvider {
    public name = "pat";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.token || !config.host) {
            return;
        }

        return async function (headers: Headers): Promise<void> {
            headers.set("Authorization", `Bearer ${config.token}`);
        };
    }
}
