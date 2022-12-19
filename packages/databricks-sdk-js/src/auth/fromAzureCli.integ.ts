import {CurrentUserService, ApiClient} from "..";
import {sleep} from "../test/IntegrationTestSetup";
import {fromAzureCli} from "./fromAzureCli";

// we can't run this test in CI because it requires Azure CLI to be installed
// and logged in on the machine
describe.skip(__filename, function () {
    this.timeout(15_000);

    it("should login with Azure CLI", async () => {
        const client = new ApiClient({
            credentialProvider: fromAzureCli(),
        });

        const scimApi = new CurrentUserService(client);
        await scimApi.me();

        await sleep(1200);
        await scimApi.me();
    });
});
