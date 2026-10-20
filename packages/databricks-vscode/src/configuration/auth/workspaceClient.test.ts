/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {reset, spy, when} from "ts-mockito";
import {recordHttpRequests} from "../../test/utils";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {createWorkspaceClient} from "./workspaceClient";

function distinct<T>(values: T[]): T[] {
    return [...new Set(values)];
}

describe(__filename, () => {
    let server: http.Server;
    let host: URL;
    let recorder: ReturnType<typeof recordHttpRequests>;
    let configsSpy: typeof workspaceConfigs;
    let strictSSLEnv: string | undefined;

    beforeEach(async () => {
        server = http.createServer((request, response) => {
            response.writeHead(200, {"content-type": "application/json"});
            response.end(JSON.stringify({userName: "user@example.com"}));
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve)
        );
        host = new URL(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        );
        recorder = recordHttpRequests(host);
        configsSpy = spy(workspaceConfigs);
        strictSSLEnv = process.env.DATABRICKS_SDK_PROXY_STRICT_SSL;
        delete process.env.DATABRICKS_SDK_PROXY_STRICT_SSL;
    });

    afterEach(async () => {
        recorder.restore();
        reset(configsSpy);
        if (strictSSLEnv === undefined) {
            delete process.env.DATABRICKS_SDK_PROXY_STRICT_SSL;
        } else {
            process.env.DATABRICKS_SDK_PROXY_STRICT_SSL = strictSSLEnv;
        }
        await new Promise((resolve) => server.close(resolve));
    });

    function me() {
        return createWorkspaceClient({
            host: host.toString(),
            authType: "pat",
            token: "t",
        }).currentUser.me();
    }

    it("tags the client with the extension product", () => {
        const client = createWorkspaceClient({
            host: host.toString(),
            authType: "pat",
            token: "t",
        });

        assert.strictEqual(client.apiClient.product, "databricks-vscode");
    });

    // Under `http.proxySupport: on`, VS Code only proxies requests without one.
    it("sends requests without an agent", async () => {
        assert.strictEqual((await me()).userName, "user@example.com");
        assert.deepStrictEqual(
            distinct(recorder.requests.map(({agent}) => agent)),
            [undefined]
        );
    });

    it("applies http.proxyStrictSSL to the requests of each new client", async () => {
        when(configsSpy.proxyStrictSSL).thenReturn(false);
        await me();
        const withoutStrictSSL = recorder.requests.splice(0);
        when(configsSpy.proxyStrictSSL).thenReturn(true);
        await me();

        assert.deepStrictEqual(
            distinct(withoutStrictSSL.map((r) => r.rejectUnauthorized)),
            [false]
        );
        assert.deepStrictEqual(
            distinct(recorder.requests.map((r) => r.rejectUnauthorized)),
            [true]
        );
    });
});
