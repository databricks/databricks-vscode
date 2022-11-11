/* eslint-disable @typescript-eslint/naming-convention */
import ".";
import assert from "node:assert";
import {ListRequest, ListReposResponse} from "./apis/repos";
import {paginated} from "./decorators";
import {CancellationToken} from "./types";

describe(__filename, () => {
    it("should paginate", async () => {
        class Test {
            public count = 0;

            @paginated("next_page_token", "repos")
            async getRepos(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _req: ListRequest,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _token?: CancellationToken
            ): Promise<ListReposResponse> {
                this.count += 1;
                if (this.count === 3) {
                    return {
                        repos: [
                            {
                                id: this.count,
                                path: "/",
                            },
                        ],
                    };
                }
                return {
                    repos: [
                        {
                            id: this.count,
                            path: "/",
                        },
                    ],
                    next_page_token: "next_page_token",
                };
            }
        }

        const t = new Test();
        const response = await t.getRepos({});
        assert.equal(t.count, 3);
        assert.notEqual(response.repos, undefined);
        assert.equal(response.repos!.length, 3);
    });

    it("should cancel", async () => {
        const token = {
            isCancellationRequested: false,
        };

        class Test {
            public count = 0;

            @paginated("next_page_token", "repos")
            async getRepos(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _req: ListRequest,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                _token: CancellationToken
            ): Promise<ListReposResponse> {
                this.count += 1;
                if (this.count === 3) {
                    token.isCancellationRequested = true;
                }
                return {
                    repos: [
                        {
                            id: this.count,
                            path: "/",
                        },
                    ],
                    next_page_token: "next_page_token",
                };
            }
        }

        const t = new Test();
        await t.getRepos({}, token);
        assert.equal(t.count, 3);
    });
});
