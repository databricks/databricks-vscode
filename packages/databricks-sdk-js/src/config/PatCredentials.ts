import {ClientRequest} from "node:http";
import {AuthVisitor, Config, CredentialProvider} from "./Config";

export class PatCredentials implements CredentialProvider {
    public name = "pat";

    async configure(config: Config): Promise<AuthVisitor | undefined> {
        if (!config.token || !config.host) {
            return;
        }

        return async function (req: ClientRequest): Promise<void> {
            req.setHeader("Authorization", `Bearer ${config.token}`);
        };
    }
}
