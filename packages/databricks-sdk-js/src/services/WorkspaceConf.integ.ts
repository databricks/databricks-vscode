import {WorkspaceConf} from "..";
import assert from "assert";

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should read configuration properties", async () => {
        let wsConf = new WorkspaceConf(integSetup.client);

        const state = await wsConf.getStatus([
            "enableProjectTypeInWorkspace",
            "enableWorkspaceFilesystem",
        ]);

        assert("enableProjectTypeInWorkspace" in state);
        assert("enableWorkspaceFilesystem" in state);
    });
});
