import {Token} from "./Token";

/**
 * An object representing temporary or permanent AWS credentials.
 */
export interface Credentials {
    readonly token: string;
    readonly host: URL;
}

/**
 * A function that, when invoked, returns a promise that will be fulfilled with
 * a value of type T.
 */
export interface Provider<T> {
    (): Promise<T>;
}

export type CredentialProvider = Provider<Credentials>;

export class CredentialsProviderError extends Error {}

export type TokenSource = Provider<Token>;
