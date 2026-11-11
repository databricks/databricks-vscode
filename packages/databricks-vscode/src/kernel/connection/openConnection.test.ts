import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import { CliError } from "../cli/Cli";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { fakeLog } from "../../test-support/fakes";
import { HostMetadataCache } from "./hostMetadata";
import { connectRemedy, openConnection, type ConnectionTarget } from "./openConnection";

describe("connectRemedy", () => {
    const refreshFailed = new CliError(
        ["auth", "token", "--profile", "p"],
        1,
        "Error: refresh token is invalid",
        "",
    );
    it.each([
        { authType: "databricks-cli", error: refreshFailed, remedy: "signInAgain" },
        { authType: "pat", error: refreshFailed, remedy: undefined },
        { authType: undefined, error: refreshFailed, remedy: undefined },
        {
            authType: "databricks-cli",
            error: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
                code: "ECONNREFUSED",
            }),
            remedy: undefined,
        },
    ])("$authType, $error.name: $remedy", ({ authType, error, remedy }) => {
        expect(connectRemedy(authType, error)).toBe(remedy);
    });
});

describe("sign-in on a host that can't be reached", () => {
    // Node's errors: the code is on the error itself, not in a `cause`.
    const target = (host: string): ConnectionTarget => ({
        credentials: newPatCredentials("dapi-1"),
        host,
        profile: "DEFAULT",
        authType: "pat",
        child: { kind: "profile", host, profile: "DEFAULT", authType: "pat" },
    });
    const deps = (httpClient?: FakeHttpClient) => ({
        ...(httpClient !== undefined ? { httpClient } : {}),
        hostMetadata: new HostMetadataCache(new FakeHttpClient(), fakeLog()),
        log: fakeLog(),
    });
    const source = {} as never;

    it("gives the reason at once when the host doesn't resolve", async () => {
        const http = new FakeHttpClient().on("GET", SCIM_ME, () => {
            throw Object.assign(new Error("getaddrinfo ENOTFOUND nowhere.invalid"), {
                code: "ENOTFOUND",
            });
        });
        await expect(
            openConnection(
                target("https://nowhere.invalid"),
                source,
                deps(http),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({
            name: "HostUnreachableError",
            message:
                "Can't reach nowhere.invalid: the host name doesn't resolve. Check the host, or your network.",
        });
        expect(http.requests).toHaveLength(1);
    });

    it("gives the reason at once when the port refuses the connection, through the real transport", async () => {
        await expect(
            openConnection(
                target("https://127.0.0.1:1"),
                source,
                deps(),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({
            name: "HostUnreachableError",
            message: expect.stringContaining("the connection was refused"),
        });
    });
});
