import {RequestVisitor, Config, CredentialProvider, Headers} from "./Config";

export class BasicCredentials implements CredentialProvider {
    public name = "basic";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.username || !config.password) {
            return undefined;
        }

        const tokenUnB64 = `${config.username}:${config.password}`;
        const b64 = Buffer.from(tokenUnB64).toString("base64");

        return async (headers: Headers) => {
            headers["Authorization"] = `Basic ${b64}`;
        };
    }
}
