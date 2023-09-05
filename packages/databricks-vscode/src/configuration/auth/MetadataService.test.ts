/* eslint-disable @typescript-eslint/naming-convention */
import {MetadataService} from "./MetadataService";
import * as assert from "assert";
import {
    ApiClient,
    Config,
    Headers,
    MetadataServiceHostHeader,
    MetadataServiceVersion,
    MetadataServiceVersionHeader,
    RequestVisitor,
    logging,
    fetch,
} from "@databricks/databricks-sdk";
const {NamedLogger} = logging;

describe(__filename, function () {
    this.timeout(10_000);
    let metadataService: MetadataService;

    beforeEach(async () => {
        metadataService = new MetadataService(
            undefined,
            NamedLogger.getOrCreate("Extension")
        );
        await metadataService.listen();
    });

    afterEach(async () => {
        metadataService.dispose();
    });

    it("should return 404 when no apiClient is configured", async () => {
        const response = await fetch(metadataService.url, {
            headers: {
                [MetadataServiceHostHeader]: "https://test.com/",
                [MetadataServiceVersionHeader]: MetadataServiceVersion,
            },
        });

        assert.equal(response.status, 404);
    });

    it("should return credentials when apiClient is configured", async () => {
        await metadataService.setApiClient(
            new ApiClient(
                new Config({
                    host: "https://test.com",
                    credentials: {
                        name: "pat",
                        async configure(): Promise<RequestVisitor> {
                            return async (headers: Headers) => {
                                headers["Authorization"] = `Bearer XXXX`;
                            };
                        },
                    },
                })
            )
        );

        const response = await fetch(metadataService.url, {
            headers: {
                [MetadataServiceHostHeader]: "https://test.com/",
                [MetadataServiceVersionHeader]: MetadataServiceVersion,
            },
        });

        const token = (await response.json()) as any;

        assert.equal(token.token_type, "Bearer");
        assert.equal(token.access_token, "XXXX");
    });

    it("should return 404 when magic is changed", async () => {
        metadataService.updateMagic();

        const response = await fetch(metadataService.url, {
            headers: {
                [MetadataServiceHostHeader]: "https://test.com/",
                [MetadataServiceVersionHeader]: MetadataServiceVersion,
            },
        });

        assert.equal(response.status, 404);
    });

    it("should work together with the SDK", async () => {
        await metadataService.setApiClient(
            new ApiClient(
                new Config({
                    host: "https://test.com",
                    credentials: {
                        name: "pat",
                        async configure(): Promise<RequestVisitor> {
                            return async (headers: Headers) => {
                                headers["Authorization"] = `Bearer XXXX`;
                            };
                        },
                    },
                })
            )
        );

        const config = new Config({
            authType: "metadata-service",
            host: "https://test.com",
            localMetadataServiceUrl: metadataService.url,
        });

        const apiClient = new ApiClient(config);

        const headers: Record<string, string> = {};
        await apiClient.config.authenticate(headers);

        assert.equal(headers["Authorization"], "Bearer XXXX");
    });
});
