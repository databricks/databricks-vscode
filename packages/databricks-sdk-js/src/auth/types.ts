import {ConfigFileProfileParsingError} from "..";

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

export type Profile = {
    host: URL;
    token: string;
};

export type Profiles = Record<
    string,
    WithError<Profile, ConfigFileProfileParsingError>
>;

export class WithError<L, ErrType> {
    constructor(readonly value?: L, readonly error?: ErrType) {
        if (
            (value === undefined && error === undefined) ||
            (value !== undefined && error !== undefined)
        ) {
            throw new Error(
                "WithError type must have exactly 1 option defined"
            );
        }
    }

    static fromTry<L, ErrType = unknown>(fn: () => L) {
        try {
            const result = fn();
            return new WithError<L, ErrType>(result);
        } catch (e) {
            return new WithError<L, ErrType>(undefined, e as ErrType);
        }
    }
}
