/* eslint-disable @typescript-eslint/naming-convention */
import * as http from "node:http";
import * as crypto from "node:crypto";
import {Disposable} from "vscode";
import {AddressInfo} from "node:net";
import {ApiClient} from "@databricks/databricks-sdk";

export class MetadataService implements Disposable {
    private server:
        | http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
        | undefined;

    private magic!: string;

    constructor(public apiClient?: ApiClient) {
        this.updateMagic();
    }

    get url(): string {
        const port = (this.server?.address() as AddressInfo).port;
        if (!port) {
            throw new Error("Server not listening");
        }
        return `http://127.0.0.1:${port}/${this.magic}`;
    }

    updateMagic() {
        this.magic = crypto.randomUUID();
    }

    dispose() {
        if (this.server) {
            this.server.close();
        }
    }

    listen(): Promise<void> {
        this.server = http.createServer((req, res) => {
            (async () => {
                if (req.url === `/${this.magic}` && this.apiClient) {
                    const headers: Record<string, string> = {};
                    await this.apiClient.config.authenticate(headers);

                    const auth = headers["Authorization"].split(" ");

                    res.writeHead(200, {"Content-Type": "text/json"});
                    res.end(
                        JSON.stringify({
                            host: await this.apiClient.config.host,
                            token_type: auth[0],
                            access_token: auth[1],
                            expires_on: Math.floor(Date.now() / 1000) + 15, // valid for 15 seconds
                        })
                    );
                } else {
                    res.writeHead(404, {"Content-Type": "text/json"});
                    res.end(JSON.stringify({"not-found": true}));
                }
            })().catch((e) => {
                res.writeHead(500, {"Content-Type": "text/json"});
                res.end(JSON.stringify({error: true}));
            });
        });

        return new Promise((resolve, reject) => {
            this.server?.listen(0, "127.0.0.1", () => {
                resolve();
            });
            this.server?.on("error", (err) => {
                reject(err);
            });
        });
    }
}
