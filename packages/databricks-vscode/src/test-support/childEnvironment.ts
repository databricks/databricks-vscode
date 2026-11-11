import type { ChildEnvironment } from "../kernel/cli/childEnv";

const CERT_FILE = "/corp/bundle.pem";
const PROXY = "http://vscode-proxy:3128";

/**
 * A host env and settings for `fakeKernel` under which each
 * `ChildEnvironment` gives a child different variables: only `cli` drops
 * `SSL_CERT_FILE`, and only `inherited` leaves out `http.proxy`. Spread them
 * into the test's own objects: `fakeSettings` writes to the one it's given.
 */
export const PROBE_ENV = { SSL_CERT_FILE: CERT_FILE };
export const PROBE_SETTINGS = { "http.proxy": PROXY };

/** Which environment a child of a kernel built with the probe got; undefined when it matches none. */
export function environmentOf(
    env: Readonly<Record<string, string | undefined>> | undefined,
): ChildEnvironment | undefined {
    const cert = env?.SSL_CERT_FILE === CERT_FILE;
    switch (env?.HTTPS_PROXY) {
        case PROXY:
            return cert ? "hostAndProxy" : "cli";
        case undefined:
            return cert ? "inherited" : undefined;
        default:
            return undefined;
    }
}
