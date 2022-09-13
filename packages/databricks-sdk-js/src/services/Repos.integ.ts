/* eslint-disable @typescript-eslint/naming-convention */

import {IntegrationTestSetup, sleep} from "../test/IntegrationTestSetup";
import * as assert from "node:assert";
import {Repos} from "./Repos";
import {ListReposResponse, RepoInfo, ReposService} from "../apis/repos";
import {randomUUID} from "node:crypto";
import {WorkspaceService} from "../apis/workspace";
import path from "node:path";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;
    const repoDir = "/Repos/js-sdk-tests";
    let testRepoDetails: RepoInfo;

    this.timeout(10 * 60 * 1000);

    async function createRandomRepo(
        repoService?: ReposService
    ): Promise<RepoInfo> {
        repoService = repoService ?? new ReposService(integSetup.client);
        const id = randomUUID();
        const resp = await repoService.create({
            path: `${repoDir}/test-${id}`,
            url: "https://github.com/fjakobs/empty-repo.git",
            provider: "github",
        });
        assert.equal(resp.path, `${repoDir}/test-${id}`);

        return resp;
    }

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
        let workspaceService = new WorkspaceService(integSetup.client);
        await workspaceService.mkdirs({
            path: repoDir,
        });

        testRepoDetails = await createRandomRepo(
            new ReposService(integSetup.client)
        );
    });

    after(async () => {
        const repos = new ReposService(integSetup.client);
        await repos.delete({repo_id: `${testRepoDetails.id}`});
    });

    it("should list repos by prefix", async () => {
        let repos = new Repos(integSetup.client);
        let response = await repos.getRepos({
            path_prefix: repoDir,
        });
        assert.ok(response.repos!.length > 0);
    });

    // skip test as it takes too long to run
    it.skip("should list all repos", async () => {
        let repos = new Repos(integSetup.client);
        let response = await repos.getRepos({});

        assert.notEqual(response.repos, undefined);
        assert.ok(response.repos!.length > 0);
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
        assert.notEqual((await response).repos, undefined);
        assert.ok((await response).repos!.length > 0);
    });
});
