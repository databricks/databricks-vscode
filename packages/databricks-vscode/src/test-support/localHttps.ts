import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import https, { type Server } from "node:https";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

export interface LocalHttps {
    /** `https://localhost:<port>`, a name the certificate covers. */
    readonly url: string;
    /** The certificate, to trust with `trustLocalCa`. */
    readonly ca: string;
    close(): Promise<void>;
}

/**
 * Trusts the local server's certificate for requests that don't name an agent,
 * through the global agent's CA list, which the transport uses. Verification
 * stays on. Returns what to call to restore the list.
 */
export function trustLocalCa(ca: string): () => void {
    const options = https.globalAgent.options as { ca?: string | string[] };
    const before = options.ca;
    options.ca = [ca];
    return () => {
        if (before === undefined) {
            delete options.ca;
        } else {
            options.ca = before;
        }
    };
}

let certificate: Promise<{ key: string; cert: string }> | undefined;

/**
 * A self-signed certificate for localhost and 127.0.0.1, made with `openssl`
 * once per test process, as `mock/run-e2e.sh` makes its own. It's never
 * committed, and nothing trusts it.
 */
function localhostCertificate(): Promise<{ key: string; cert: string }> {
    certificate ??= (async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-https-"));
        try {
            execFileSync(
                "openssl",
                [
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-days",
                    "1",
                    "-subj",
                    "/CN=localhost",
                    "-addext",
                    "subjectAltName=DNS:localhost,IP:127.0.0.1",
                    "-keyout",
                    path.join(dir, "key.pem"),
                    "-out",
                    path.join(dir, "cert.pem"),
                ],
                { stdio: "ignore" },
            );
            return {
                key: fs.readFileSync(path.join(dir, "key.pem"), "utf-8"),
                cert: fs.readFileSync(path.join(dir, "cert.pem"), "utf-8"),
            };
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    })();
    return certificate;
}

/**
 * An HTTPS server on 127.0.0.1 with a self-signed certificate, which Node
 * doesn't trust until `trustLocalCa` pins it.
 */
export async function startLocalHttps(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<LocalHttps> {
    const { key, cert } = await localhostCertificate();
    const server: Server = https.createServer({ key, cert }, handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    return {
        url: `https://localhost:${port}`,
        ca: cert,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}
