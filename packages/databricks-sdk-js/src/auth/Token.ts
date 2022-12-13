export class Token {
    constructor(
        public readonly host: URL,
        public readonly accessToken: string,
        public readonly expiry: number
    ) {}

    public get isExpired(): boolean {
        return this.expiry < Date.now() + 10_000;
    }

    public get valid(): boolean {
        return !this.isExpired;
    }
}
