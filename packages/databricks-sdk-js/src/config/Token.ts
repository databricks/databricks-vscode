import {Provider} from "../types";
import {RequestVisitor} from "./Config";
import {Headers} from "../fetch";

export type TokenProvider = Provider<Token>;

// expiryDelta determines how earlier a token should be considered
// expired than its actual expiration time. It is used to avoid late
// expirations due to client-server time mismatches.
const expiryDelta = 10 * 1000;

export class Token {
    readonly accessToken: string;
    readonly refreshToken: string | undefined;
    readonly expiry: number; // milliseconds since epoch

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
        return this.expiry === 0 || this.expiry > Date.now() + expiryDelta;
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
