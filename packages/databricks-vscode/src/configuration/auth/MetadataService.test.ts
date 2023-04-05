/* eslint-disable @typescript-eslint/naming-convention */
import {MetadataService} from "./MetadataService";
import got from "got";
import * as assert from "assert";
import {
    ApiClient,
    Config,
    Headers,
    MetadataServiceHostHeader,
    MetadataServiceVersion,
    MetadataServiceVersionHeader,
    RequestVisitor,
} from "@databricks/databricks-sdk";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";

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
        const response = await got(metadataService.url, {
            throwHttpErrors: false,
            headers: {
                [MetadataServiceHostHeader]: "https://test.com/",
                [MetadataServiceVersionHeader]: MetadataServiceVersion,
            },
        });
        assert.equal(response.statusCode, 404);
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
        const response = (await got(metadataService.url, {
            headers: {
                [MetadataServiceHostHeader]: "https://test.com/",
                [MetadataServiceVersionHeader]: MetadataServiceVersion,
            },
        }).json()) as any;
        assert.equal(response.token_type, "Bearer");
        assert.equal(response.access_token, "XXXX");
    });

    it("should return 404 when magic is changed", async () => {
        const url = metadataService.url;
        metadataService.updateMagic();
        const response = await got(url, {
            throwHttpErrors: false,
            headers: {
                Metadata: "true",
            },
        });
        assert.equal(response.statusCode, 404);
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
