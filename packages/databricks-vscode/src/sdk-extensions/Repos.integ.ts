/* eslint-disable @typescript-eslint/naming-convention */

import {CancellationToken, workspace} from "@databricks/databricks-sdk";
import {IntegrationTestSetup} from "./test/IntegrationTestSetup";
import {Context} from "@databricks/databricks-sdk/dist/context";
import * as assert from "node:assert";
import {Repo} from "./Repos";
import {randomUUID} from "node:crypto";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;
    const repoDir = "/Repos/js-sdk-tests";
    let testRepoDetails: workspace.RepoInfo;

    this.timeout(10 * 60 * 1000);

    async function createRandomRepo(
        repoService?: workspace.ReposService
    ): Promise<workspace.RepoInfo> {
        repoService =
            repoService ??
            new workspace.ReposService(integSetup.client.apiClient);
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
        const workspaceService = new workspace.WorkspaceService(
            integSetup.client.apiClient
        );
        await workspaceService.mkdirs({
            path: repoDir,
        });

        testRepoDetails = await createRandomRepo(
            new workspace.ReposService(integSetup.client.apiClient)
        );
    });

    after(async () => {
        const repos = new workspace.ReposService(integSetup.client.apiClient);
        await repos.delete({repo_id: testRepoDetails.id!});
    });

    it("should list repos by prefix", async () => {
        const repos = [];
        for await (const repo of Repo.list(integSetup.client.apiClient, {
            path_prefix: repoDir,
        })) {
            repos.push(repo);
        }

        assert.ok(repos.length > 0);
    });

    // skip test as it takes too long to run
    it.skip("should list all repos", async () => {
        const repos = [];
        for await (const repo of Repo.list(integSetup.client.apiClient, {})) {
            repos.push(repo);
        }

        assert.ok(repos.length > 0);
    });

    it("should cancel listing repos", async () => {
        let listener: any;
        const token: CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: (_listener) => {
                listener = _listener;
            },
        };

        const response = Repo.list(
            integSetup.client.apiClient,
            {
                path_prefix: repoDir,
            },
            new Context({cancellationToken: token})
        );

        setTimeout(() => {
            token.isCancellationRequested = true;
            listener && listener();
        }, 100);

        // reponse should finish soon after cancellation
        const start = Date.now();
        try {
            for await (const repo of response) {
                assert.ok(repo);
            }
        } catch (err: any) {
            assert.equal(err.name, "AbortError");
        }

        assert.ok(Date.now() - start < 300);
    });

    it("Should find the exact matching repo if multiple repos with same prefix in fromPath", async () => {
        const actual = await Repo.fromPath(
            integSetup.client.apiClient,
            testRepoDetails.path!
        );
        assert.equal(actual.path, testRepoDetails.path);
    });
});
