/* eslint-disable @typescript-eslint/naming-convention */

import {IntegrationTestSetup, sleep} from "../test/IntegrationTestSetup";
import {ReposService} from "./repos";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should list repos by prefix", async () => {
        let reposApi = new ReposService(integSetup.client);

        let response = await reposApi.getRepos({
            path_prefix: "/Repos/fabian.jakobs@databricks.com",
        });
        console.log(response);
    });

    it("should list all repos", async () => {
        let reposApi = new ReposService(integSetup.client);

        let response = await reposApi.getRepos({
            path_prefix: "/Repos/.internal",
        });
        console.log(response);
    });
});
