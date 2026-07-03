import * as assert from "assert";
import {instance, mock, when} from "ts-mockito";
import {DatabricksCliCheck, LOGIN_TIMEOUT_SECONDS} from "./DatabricksCliCheck";
import {DatabricksCliAuthProvider} from "./AuthProvider";

describe(__filename, () => {
    const cliPath = "/path/to/bin/databricks";

    function createProvider(profile?: string) {
        const provider = mock(DatabricksCliAuthProvider);
        when(provider.host).thenReturn(
            new URL("https://test.cloud.databricks.com")
        );
        when(provider.cliPath).thenReturn(cliPath);
        when(provider.profile).thenReturn(profile);
        return instance(provider);
    }

    describe("login", () => {
        it("passes a bounded --timeout to auth login so it cannot hang indefinitely", async () => {
            let capturedArgs: string[] | undefined;
            const check = new DatabricksCliCheck(
                createProvider("dev"),
                async (_file, args) => {
                    capturedArgs = args;
                    return {stdout: "", stderr: ""};
                }
            );

            await (check as any).login();

            assert.ok(capturedArgs, "execFile should have been invoked");
            assert.deepStrictEqual(capturedArgs, [
                "auth",
                "login",
                "--profile",
                "dev",
                "--timeout",
                `${LOGIN_TIMEOUT_SECONDS}s`,
            ]);
        });

        it("uses --host when no profile is configured", async () => {
            let capturedArgs: string[] | undefined;
            const check = new DatabricksCliCheck(
                createProvider(undefined),
                async (_file, args) => {
                    capturedArgs = args;
                    return {stdout: "", stderr: ""};
                }
            );

            await (check as any).login();

            assert.deepStrictEqual(capturedArgs, [
                "auth",
                "login",
                "--host",
                "https://test.cloud.databricks.com",
                "--timeout",
                `${LOGIN_TIMEOUT_SECONDS}s`,
            ]);
        });

        it("surfaces an actionable message when login fails (e.g. WSL browser hang/timeout)", async () => {
            const check = new DatabricksCliCheck(
                createProvider("dev"),
                async () => {
                    throw {stderr: "context deadline exceeded"};
                }
            );

            await assert.rejects((check as any).login(), (e: Error) => {
                assert.match(e.message, /context deadline exceeded/);
                // Tells the user how to recover instead of leaving them stuck.
                assert.match(e.message, /databricks auth login --profile dev/);
                return true;
            });
        });
    });
});
