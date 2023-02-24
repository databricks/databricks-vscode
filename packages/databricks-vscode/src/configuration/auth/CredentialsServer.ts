/* eslint-disable @typescript-eslint/naming-convention */
import {Token} from "@databricks/databricks-sdk/dist/config/Token";
import * as http from "node:http";
import * as crypto from "node:crypto";
import {Disposable} from "vscode";

type CredentialsProvider = () => Promise<Token>;

export class CredentialsServer implements Disposable {
    private server:
        | http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
        | undefined;

    private magic: string;

    constructor(
        readonly port: number,
        readonly host: string,
        private credentialsProvider: CredentialsProvider
    ) {
        this.magic = crypto.randomUUID();
    }

    get url(): string {
        return `http://localhost:${this.port}/{this.magic}`;
    }

    dispose() {
        if (this.server) {
            this.server.close();
        }
    }

    listen(): Promise<void> {
        this.server = http.createServer((req, res) => {
            (async () => {
                const url = new URL(req.url!);
                if (
                    url.searchParams.get("host") === this.host &&
                    url.pathname === `/${this.magic}`
                ) {
                    const token = await this.credentialsProvider();

                    res.writeHead(200, {"Content-Type": "text/json"});
                    res.end(
                        JSON.stringify({
                            host: this.host,
                            token: token.accessToken,
                        })
                    );
                } else {
                    res.writeHead(404, {"Content-Type": "text/json"});
                    res.end(JSON.stringify({"not-found": true}));
                }
            })().catch(() => {
                res.writeHead(500, {"Content-Type": "text/json"});
                res.end(JSON.stringify({error: true}));
            });
        });

        return new Promise((resolve, reject) => {
            this.server?.listen(this.port, () => {
                resolve();
            });
            this.server?.on("error", (err) => {
                reject(err);
            });
        });
    }
}
