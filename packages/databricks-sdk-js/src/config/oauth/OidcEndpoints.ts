import {Config} from "../Config";
import {Client, ClientOptions} from "./Client";

export class OidcEndpoints {
    constructor(
        public readonly config: Config,
        public readonly authorizationEndpoint: URL,
        public readonly tokenEndpoint: URL
    ) {}

    getClient(options: ClientOptions): Client {
        return new Client(this, options);
    }
}
