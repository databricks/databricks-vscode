/**
 * What each network failure means, by the Node or undici code on the error
 * or its `cause`: `fetch` rejects with a bare `TypeError("fetch failed")`
 * and keeps the reason there. `final`: when connecting, trying again at once
 * gets the same answer; a timeout, a dropped connection, or a host or network
 * out of reach while Wi-Fi or a VPN reconnects may pass. `EAI_AGAIN` is a
 * lookup that failed, for now or for good: some resolvers answer it for a host
 * that doesn't exist.
 */
const FAILURES: Readonly<Record<string, { readonly what: string; readonly final: boolean }>> = {
    ENOTFOUND: { what: "the host name doesn't resolve", final: true },
    EAI_AGAIN: { what: "the host name lookup failed", final: true },
    ECONNREFUSED: { what: "the connection was refused", final: true },
    ETIMEDOUT: { what: "the connection timed out", final: false },
    UND_ERR_CONNECT_TIMEOUT: { what: "the connection timed out", final: false },
    ECONNRESET: { what: "the connection was dropped", final: false },
    UND_ERR_SOCKET: { what: "the connection was dropped", final: false },
    EHOSTUNREACH: { what: "there's no route to the host", final: false },
    ENETUNREACH: { what: "the network is unreachable", final: false },
    EPIPE: { what: "the connection was dropped", final: false },
    ECONNABORTED: { what: "the connection was dropped", final: false },
};

/** The network failure's code, on the error or a `cause` under it; undefined for any other error. */
export function networkFailureCode(error: unknown): string | undefined {
    for (let e = error, depth = 0; e instanceof Error && depth < 4; e = e.cause, depth++) {
        const { code } = e as { code?: unknown };
        if (typeof code === "string" && Object.hasOwn(FAILURES, code)) {
            return code;
        }
    }
    return undefined;
}

/** A host that doesn't resolve or refuses the connection: when connecting, trying again won't help. */
export function isFinalNetworkFailure(error: unknown): boolean {
    const code = networkFailureCode(error);
    return code !== undefined && FAILURES[code]!.final;
}

/** A request that never reached the host, with a reason that names it rather than `fetch`'s "fetch failed". */
export class HostUnreachableError extends Error {
    constructor(
        readonly host: string,
        readonly code: string,
        cause: unknown,
    ) {
        super(
            `Can't reach ${hostName(host)}: ${FAILURES[code]!.what}. Check the host, or your network.`,
            { cause },
        );
        this.name = "HostUnreachableError";
    }
}

/** The error to show for a request to `host` that failed on the network; undefined for any other failure. */
export function unreachableError(host: string, error: unknown): HostUnreachableError | undefined {
    const code = networkFailureCode(error);
    return code === undefined ? undefined : new HostUnreachableError(host, code, error);
}

function hostName(host: string): string {
    try {
        return new URL(host).host;
    } catch {
        return host;
    }
}
