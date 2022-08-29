/* eslint-disable @typescript-eslint/naming-convention */

import {IntegrationTestSetup, sleep} from "../test/IntegrationTestSetup";
import * as assert from "node:assert";
import {Repos} from "./Repos";
import {GetRepoResponse, ReposService} from "../apis/repos";
import {randomUUID} from "node:crypto";
import {WorkspaceService} from "../apis/workspace";
import path from "node:path";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;
    const repoDir = "/Repos/js-sdk-tests";
    let testRepoDetails: GetRepoResponse;

    this.timeout(10 * 60 * 1000);

    async function createRepo(repoName: string, repoService?: ReposService) {
        repoService = repoService ?? new ReposService(integSetup.client);
        return await repoService.createRepo({
            path: `${repoDir}/${repoName}`,
            url: "https://github.com/fjakobs/empty-repo.git",
            provider: "github",
        });
    }

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
        let workspaceService = new WorkspaceService(integSetup.client);
        await workspaceService.mkdirs({
            path: repoDir,
        });
        const id = randomUUID();
        testRepoDetails = await createRepo(`test-${id}`);
        assert.equal(testRepoDetails.path, `${repoDir}/test-${id}`);
    });

    after(async () => {
        const repos = new ReposService(integSetup.client);
        await repos.deleteRepo({id: testRepoDetails.id});
    });

    it("should create a repo", async () => {
        const id = randomUUID();
        const repos = new ReposService(integSetup.client);
        const response = await createRepo(`test-${id}`, repos);
        try {
            assert.equal(response.path, `${repoDir}/test-${id}`);
        } finally {
            await repos.deleteRepo({id: response.id});
        }
    });

    it("should list repos by prefix", async () => {
        let repos = new Repos(integSetup.client);
        let response = await repos.getRepos({
            path_prefix: repoDir,
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
                path_prefix: repoDir,
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
