import {Provider} from "../auth/types";
import {RequestVisitor, Headers} from "./Config";

export type TokenProvider = Provider<Token>;

export class Token {
    readonly accessToken: string;
    readonly refreshToken: string | undefined;
    readonly expiry: number;

    constructor(options: {
        accessToken: string;
        refreshToken?: string;
        expiry?: number;
    }) {
        this.refreshToken = options.refreshToken;
        this.accessToken = options.accessToken;
        this.expiry = options.expiry || 0;
    }

    public isValid(): boolean {
        return this.expiry === 0 || this.expiry > Date.now() + 10_000;
    }
}

export function refreshableTokenProvider(
    source: TokenProvider
): RequestVisitor {
    let token: Token | undefined;

    return async (headers: Headers) => {
        if (!token || !token.isValid()) {
            token = await source();
        }

        headers["Authorization"] = `Bearer ${token.accessToken}`;
    };
}
