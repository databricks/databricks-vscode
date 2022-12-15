import {Credentials} from "./types";

export class Token implements Credentials {
    constructor(
        public readonly host: URL,
        public readonly token: string,
        public readonly expiry: number
    ) {}

    public isValid(): boolean {
        return this.expiry > Date.now() + 10_000;
    }
}
