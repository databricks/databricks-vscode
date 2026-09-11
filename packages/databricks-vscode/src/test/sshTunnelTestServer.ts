import {generateKeyPairSync} from "node:crypto";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {WebSocketServer} from "ws";

/** Local workspace/driver-proxy peer; the CLI's byte-stream transport stays real. */
export async function createSshTunnelTestServer() {
    const {privateKey, publicKey} = generateKeyPairSync("ed25519");
    const rawPublicKey = publicKey
        .export({type: "spki", format: "der"})
        .subarray(-32);
    const sshString = (value: Buffer) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(value.length);
        return Buffer.concat([length, value]);
    };
    const authorizedKey = `ssh-ed25519 ${Buffer.concat([
        sshString(Buffer.from("ssh-ed25519")),
        sshString(rawPublicKey),
    ]).toString("base64")}`;
    const unexpectedRequests: string[] = [];
    let receivedBytes = 0;
    let connections = 0;

    const server = createServer((request, response) => {
        const url = new URL(request.url!, "http://localhost");
        let body: unknown;
        /* eslint-disable @typescript-eslint/naming-convention */
        switch (url.pathname) {
            case "/.well-known/databricks-config":
                response.statusCode = 404;
                body = {};
                break;
            case "/api/2.0/preview/scim/v2/Me":
                body = {userName: "ssh-test", id: "1"};
                break;
            case "/api/2.0/clusters/get":
            case "/api/2.1/clusters/get":
                body = {
                    cluster_id: "test-cluster",
                    state: "RUNNING",
                    data_security_mode: "SINGLE_USER",
                    single_user_name: "ssh-test",
                };
                break;
            case "/api/2.0/secrets/list":
                body = {secrets: []};
                break;
            case "/api/2.0/secrets/get": {
                const value =
                    url.searchParams.get("key") === "client-private-key"
                        ? privateKey.export({type: "pkcs8", format: "pem"})
                        : authorizedKey;
                body = {value: Buffer.from(value).toString("base64")};
                break;
            }
            case "/telemetry-ext":
                body = {};
                break;
            case "/driver-proxy-api/o/1/test-cluster/7772/capabilities":
                body = {resume: true};
                break;
            default:
                unexpectedRequests.push(`${request.method} ${url.pathname}`);
                response.statusCode = 404;
                body = {
                    error_code: "NOT_FOUND",
                    message: "Unexpected test request",
                };
        }
        /* eslint-enable @typescript-eslint/naming-convention */
        response.setHeader("Content-Type", "application/json");
        response.setHeader("X-Databricks-Org-Id", "1");
        response.end(JSON.stringify(body));
    });
    const sockets = new WebSocketServer({server});
    sockets.on("connection", (socket, request) => {
        connections++;
        const url = new URL(request.url!, "http://localhost");
        if (url.pathname !== "/driver-proxy-api/o/1/test-cluster/7772/ssh") {
            unexpectedRequests.push(`WebSocket ${url.pathname}`);
        }
        if (request.headers.authorization !== "Bearer local-test-token") {
            unexpectedRequests.push("WebSocket auth was not forwarded");
        }
        socket.on("error", (error) =>
            unexpectedRequests.push(`WebSocket error: ${error.message}`)
        );
        socket.on("message", (data, binary) => {
            if (!binary) {
                return;
            }
            const bytes = Buffer.isBuffer(data)
                ? data
                : Array.isArray(data)
                  ? Buffer.concat(data)
                  : Buffer.from(data);
            receivedBytes += bytes.length;
            socket.send(bytes, {binary: true});
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    return {
        host: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        unexpectedRequests,
        get receivedBytes() {
            return receivedBytes;
        },
        get connections() {
            return connections;
        },
        async dispose() {
            sockets.clients.forEach((socket) => socket.terminate());
            sockets.close();
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve()))
            );
        },
    };
}
