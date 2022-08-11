/* eslint-disable @typescript-eslint/naming-convention */

import {IntegrationTestSetup, sleep} from "../test/IntegrationTestSetup";
import * as assert from "node:assert";
import {Repos} from "./Repos";
import {ReposService} from "../apis/repos";
import {randomUUID} from "node:crypto";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should create a repo", async () => {
        const repos = new ReposService(integSetup.client);
        const id = randomUUID();
        const response = await repos.createRepo({
            path: `/Repos/fabian.jakobs@databricks.com/test-${id}`,
            url: "https://github.com/fjakobs/empty-repo.git",
            provider: "github",
        });

        try {
            assert.equal(
                response.path,
                `/Repos/fabian.jakobs@databricks.com/test-${id}`
            );
        } finally {
            await repos.deleteRepo({id: response.id});
        }
    });

    it("should list repos by prefix", async () => {
        let repos = new Repos(integSetup.client);
        let response = await repos.getRepos({
            path_prefix: "/Repos/fabian.jakobs@databricks.com",
        });
        assert.ok(response.repos.length > 0);
    });

    // skip test as it takes too long to run
    it.skip("should list all repos", async () => {
        let repos = new Repos(integSetup.client);
        let response = repos.getRepos({});

        assert.ok((await response).repos.length > 0);
    });

    it("should cancel listing repos", async () => {
        let repos = new Repos(integSetup.client);

        let token = {
            isCancellationRequested: false,
        };

        let response = repos.getRepos(
            {
                path_prefix: "/Repos/.internal",
            },
            token
        );

        await sleep(2000);
        token.isCancellationRequested = true;

        // reponse should finish soon after cancellation
        const start = Date.now();
        await response;
        assert.ok(Date.now() - start < 600);

        assert.ok((await response).repos.length > 0);
    });
});
