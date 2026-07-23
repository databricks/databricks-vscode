import * as assert from "assert";
import {instance, mock, when} from "ts-mockito";
import {DatabricksCliCheck, LOGIN_TIMEOUT_SECONDS} from "./DatabricksCliCheck";
import {DatabricksCliAuthProvider} from "./AuthProvider";

describe(__filename, () => {
    const cliPath = "/path/to/bin/databricks";

    function createProvider(
        profile?: string,
        host = "https://test.cloud.databricks.com",
        workspaceId?: string
    ) {
        const provider = mock(DatabricksCliAuthProvider);
        when(provider.host).thenReturn(new URL(host));
        when(provider.cliPath).thenReturn(cliPath);
        when(provider.profile).thenReturn(profile);
        when(provider.workspaceId).thenReturn(workspaceId);
        return instance(provider);
    }

    describe("login", () => {
        it("always passes --host so a new/unresolved profile does not fall back to the public login page", async () => {
            // Regression test for the custom-host OAuth sign-in bug: creating a
            // new profile passed only --profile, so the CLI could not resolve a
            // host and opened login.databricks.com instead of the workspace.
            let capturedArgs: string[] | undefined;
            const check = new DatabricksCliCheck(
                createProvider("dev", "https://customer.custom-host.com"),
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
                "--host",
                "https://customer.custom-host.com",
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

        it("preserves the SPOG workspace id on the --host so re-login keeps the workspace routing", async () => {
            let capturedArgs: string[] | undefined;
            const check = new DatabricksCliCheck(
                createProvider(
                    "dev",
                    "https://test.cloud.databricks.com",
                    "1234567890"
                ),
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
                "https://test.cloud.databricks.com?w=1234567890",
                "--profile",
                "dev",
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
                // The suggested command must include --host so it works even
                // when the profile does not exist yet, and the host must be
                // single-quoted so it is copy-paste safe.
                assert.match(
                    e.message,
                    /databricks auth login --host '\S+' --profile dev/
                );
                return true;
            });
        });

        it("single-quotes the host in the recovery message so a SPOG '?w=' host is copy-paste safe in zsh/bash", async () => {
            const check = new DatabricksCliCheck(
                createProvider(
                    "dev",
                    "https://test.cloud.databricks.com",
                    "1234567890"
                ),
                async () => {
                    throw {stderr: "context deadline exceeded"};
                }
            );

            await assert.rejects((check as any).login(), (e: Error) => {
                // The unquoted "?" would be a glob in zsh/bash; the quoted
                // form runs verbatim.
                assert.ok(
                    e.message.includes(
                        "databricks auth login --host 'https://test.cloud.databricks.com?w=1234567890' --profile dev"
                    ),
                    `recovery command not shell-safe: ${e.message}`
                );
                return true;
            });
        });
    });
});
