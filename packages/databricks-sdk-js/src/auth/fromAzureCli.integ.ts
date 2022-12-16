import {WorkspaceClient} from "..";
import {sleep} from "../test/IntegrationTestSetup";

// we can't run this test in CI because it requires Azure CLI to be installed
// and logged in on the machine
describe.skip(__filename, function () {
    this.timeout(15_000);

    it("should login with Azure CLI", async () => {
        const client = new WorkspaceClient({
            product: "test",
            productVersion: "0.0.1",
            authType: "azure-cli",
        });

        await client.currentUser.me();

        await sleep(1200);
        await client.currentUser.me();
    });
});
