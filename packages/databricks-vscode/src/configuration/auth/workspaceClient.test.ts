/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {createWorkspaceClient} from "./workspaceClient";

describe(__filename, () => {
    let server: http.Server;
    let host: string;
    let originalRequest: typeof http.request;
    let agents: unknown[];

    beforeEach(async () => {
        server = http.createServer((request, response) => {
            response.writeHead(200, {"content-type": "application/json"});
            response.end(JSON.stringify({userName: "user@example.com"}));
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve)
        );
        host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

        agents = [];
        originalRequest = http.request;
        http.request = ((...args: Parameters<typeof http.request>) => {
            const options = args.find(
                (arg): arg is http.RequestOptions =>
                    typeof arg === "object" && !(arg instanceof URL)
            );
            agents.push(options?.agent);
            return originalRequest(...args);
        }) as typeof http.request;
    });

    afterEach(async () => {
        http.request = originalRequest;
        await new Promise((resolve) => server.close(resolve));
    });

    it("tags the client with the extension product", () => {
        const client = createWorkspaceClient({
            host,
            authType: "pat",
            token: "t",
        });

        assert.strictEqual(client.apiClient.product, "databricks-vscode");
    });

    // Under `http.proxySupport: on`, VS Code only proxies requests without one.
    it("sends requests without an agent", async () => {
        const client = createWorkspaceClient({
            host,
            authType: "pat",
            token: "t",
        });

        const me = await client.currentUser.me();

        assert.strictEqual(me.userName, "user@example.com");
        assert.deepStrictEqual(agents, [undefined]);
    });
});
