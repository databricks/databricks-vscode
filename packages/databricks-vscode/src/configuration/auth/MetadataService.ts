/* eslint-disable @typescript-eslint/naming-convention */
import * as http from "node:http";
import * as crypto from "node:crypto";
import {Disposable, EventEmitter} from "vscode";
import {AddressInfo} from "node:net";
import {
    ApiClient,
    MetadataServiceHostHeader,
    MetadataServiceVersion,
    MetadataServiceVersionHeader,
    ServerResponse,
} from "@databricks/databricks-sdk";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";

export class MetadataService implements Disposable {
    private server:
        | http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
        | undefined;

    private magic!: string;
    private _apiClient: ApiClient | undefined;
    private onDidChangeMagicEvent = new EventEmitter<void>();
    public onDidChangeMagic = this.onDidChangeMagicEvent.event;

    constructor(
        apiClient: ApiClient | undefined,
        private logger: NamedLogger
    ) {
        this.updateMagic();
        this._apiClient = apiClient;
    }

    async setApiClient(apiClient: ApiClient | undefined) {
        const oldHost = await this._apiClient?.config.getHost();
        const newHost = await apiClient?.config.getHost();
        if (oldHost !== newHost) {
            this.updateMagic();
        }

        this._apiClient = apiClient;
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
        this.onDidChangeMagicEvent.fire();
    }

    dispose() {
        if (this.server) {
            this.server.close();
        }
    }

    listen(): Promise<void> {
        this.server = http.createServer((req, res) => {
            (async () => {
                function notFound() {
                    res.writeHead(404, {"Content-Type": "text/json"});
                    res.end(JSON.stringify({not_found: true}));
                }

                if (req.url !== `/${this.magic}` || !this._apiClient) {
                    return notFound();
                }

                const requestHost = req.headers[MetadataServiceHostHeader];
                try {
                    const host = await this._apiClient.config.getHost();
                    if (
                        !requestHost ||
                        Array.isArray(requestHost) ||
                        new URL(requestHost).toString() !== host.toString()
                    ) {
                        this.logger.warn(
                            `Metadata service: Credentiuals don't match requested host ${requestHost}}`
                        );
                        return notFound();
                    }
                } catch (e) {
                    this.logger.error(
                        `Metadata service: Invalid host ${requestHost}}`,
                        e
                    );
                    return notFound();
                }

                if (
                    req.headers[MetadataServiceVersionHeader] !==
                    MetadataServiceVersion
                ) {
                    this.logger.warn(
                        `Metadata service: Unsupported version requested: ${req.headers[MetadataServiceVersionHeader]}`
                    );
                    res.writeHead(400, {"Content-Type": "text/json"});
                    res.end(JSON.stringify({bad_version: true}));
                }

                const headers: Record<string, string> = {};
                await this._apiClient.config.authenticate(headers);

                res.writeHead(200, {"Content-Type": "text/json"});

                const auth = headers["Authorization"].split(" ");
                const response: ServerResponse = {
                    access_token: auth[1],
                    expires_on: Math.floor(
                        new Date(Date.now() + 15_000).getTime() / 1000
                    ),
                    token_type: auth[0],
                };

                res.end(JSON.stringify(response));
            })().catch((e) => {
                this.logger.error(
                    `Metadata service: Error processing request: ${e.message}`,
                    e
                );

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
