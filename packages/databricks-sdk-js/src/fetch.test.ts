/* eslint-disable @typescript-eslint/naming-convention */
import http from "http";
import assert from "assert";
import {AddressInfo} from "net";

import {fetch, AbortController} from "./fetch";

describe(__filename, () => {
    let server: ReturnType<typeof http.createServer>;
    let port: number;

    before(async () => {
        return new Promise((resolve, reject) => {
            // start http server
            server = http.createServer((req, res) => {
                res.writeHead(200, {
                    "Content-Type": "application/json",
                });

                if (req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk) => {
                        body += chunk;
                    });
                    req.on("end", () => {
                        res.write(
                            JSON.stringify({
                                result: JSON.parse(body),
                            })
                        );
                        res.end();
                    });
                } else {
                    const query = new URL(req.url!, "http://localhost");
                    const timeout = parseInt(
                        query.searchParams.get("timeout") || "0"
                    );

                    setTimeout(() => {
                        res.end('{"hello": "world"}');
                    }, timeout);
                }
            });
            server.listen(0);
            server.on("listening", () => {
                port = (server.address() as AddressInfo).port;
                console.log(`Server listening on http://localhost:${port}`);
                resolve();
            });
            server.on("error", reject);
        });
    });

    after(async () => {
        return new Promise((resolve, reject) => {
            // stop http server
            server.close();
            server.on("close", resolve);
            server.on("error", reject);
        });
    });

    it("should fetch", async () => {
        const response = await fetch("http://localhost:" + port);
        const json = await response.json();
        assert.deepEqual(json, {hello: "world"});
    });

    it("should post data", async () => {
        const response = await fetch("http://localhost:" + port, {
            method: "POST",
            body: JSON.stringify({hello: "world"}),
        });
        const json = await response.json();
        assert.deepEqual(json, {result: {hello: "world"}});
    });

    it("should abort after the request", async () => {
        const ac = new AbortController();
        const signal = ac.signal;

        await fetch("http://localhost:" + port, {signal});
        ac.abort();
    });

    it("should abort during the request", async () => {
        const ac = new AbortController();
        const signal = ac.signal;

        setTimeout(() => {
            ac.abort();
        }, 50);

        let aborted = false;
        try {
            await fetch(`http://localhost:${port}?timeout=1000`, {signal});
        } catch (err: any) {
            assert.equal(err.name, "AbortError");
            aborted = true;
        }

        assert.ok(aborted);
    });

    it("should abort before the request", async () => {
        const ac = new AbortController();
        const signal = ac.signal;
        ac.abort();

        let aborted = false;
        try {
            await fetch("http://localhost:" + port, {signal});
        } catch (err: any) {
            assert.equal(err.name, "AbortError");
            aborted = true;
        }

        assert.ok(aborted);
    });
});
