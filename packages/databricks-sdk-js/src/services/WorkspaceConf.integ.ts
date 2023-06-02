import {ApiError, WorkspaceConf} from "..";
import assert from "assert";

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async function () {
        integSetup = await IntegrationTestSetup.getInstance();
        try {
            const wsConf = new WorkspaceConf(integSetup.client.apiClient);
            await wsConf.getStatus(["enableProjectTypeInWorkspace"]);
        } catch (e: unknown) {
            if (e instanceof ApiError && e.statusCode === 403) {
                // eslint-disable-next-line no-console
                console.log(
                    "Workspace conf tests require administrator permissions"
                );
                this.skip();
            }
        }
    });

    it("should read configuration properties", async () => {
        const wsConf = new WorkspaceConf(integSetup.client.apiClient);

        const state = await wsConf.getStatus([
            "enableProjectTypeInWorkspace",
            "enableWorkspaceFilesystem",
        ]);

        assert("enableProjectTypeInWorkspace" in state);
        assert("enableWorkspaceFilesystem" in state);
    });
});
