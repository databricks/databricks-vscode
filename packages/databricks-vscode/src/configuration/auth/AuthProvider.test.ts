import * as assert from "assert";
import {instance, mock} from "ts-mockito";
import {DatabricksCliAuthProvider} from "./AuthProvider";
import {CliWrapper} from "../../cli/CliWrapper";

describe(__filename, () => {
    describe("DatabricksCliAuthProvider.toEnv", () => {
        const host = new URL("https://test.cloud.databricks.com");
        const cliPath = "/path/to/bin/databricks";

        function createProvider(profile?: string, workspaceId?: string) {
            return new DatabricksCliAuthProvider(
                host,
                cliPath,
                instance(mock(CliWrapper)),
                profile,
                workspaceId
            );
        }

        it("should expose DATABRICKS_CLI_PATH so the SDK/Terraform provider can locate the bundled CLI", () => {
            const env = createProvider("dev").toEnv();

            assert.equal(env["DATABRICKS_CLI_PATH"], cliPath);
            assert.equal(env["DATABRICKS_HOST"], host.toString());
            assert.equal(env["DATABRICKS_AUTH_TYPE"], "databricks-cli");
            assert.equal(env["DATABRICKS_CONFIG_PROFILE"], "dev");
        });

        it("should include DATABRICKS_CLI_PATH even without a profile or workspace id", () => {
            const env = createProvider().toEnv();

            assert.equal(env["DATABRICKS_CLI_PATH"], cliPath);
            assert.ok(!("DATABRICKS_CONFIG_PROFILE" in env));
            assert.ok(!("DATABRICKS_WORKSPACE_ID" in env));
        });
    });
});
