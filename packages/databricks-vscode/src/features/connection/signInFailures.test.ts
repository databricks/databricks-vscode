import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import { when } from "../../platform/reactive";
import { FAKE_CLI_PATH, fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { fetchFailed, FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { NO_PROJECT_CHOICE } from "../../kernel/connection/ConnectionService";
import { connection } from "./index";
import { workspaceConnectionRows } from "./WorkspaceConnectionSection";

const lastInputOf = (host: typeof vscode) => host.quickInputs[host.quickInputs.length - 1]!;

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();
const freshToken = () =>
    JSON.stringify({
        access_token: "u2m-token",
        expiry: new Date(Date.now() + 3600_000).toISOString(),
    });

/** The menu opens once and picks `label`; a second open is dismissed. */
function pickOnce(host: typeof vscode, label: string) {
    let picked = false;
    host.pickFrom = (items) => {
        if (picked) {
            return undefined;
        }
        picked = true;
        return items.find((i) => i.label === label);
    };
}

/** The connection feature over the real kernel, a real config file, and fakes for the CLI and HTTP. */
function setup(cfg: string) {
    const file = tempDir().write(".databrickscfg", cfg);
    const http = new FakeHttpClient().on("GET", SCIM_ME, (req) => ({
        body: { userName: `user ${req.headers.get("Authorization")}` },
    }));
    const kernel = fakeKernel({ env: { DATABRICKS_CONFIG_FILE: file }, httpClient: http });
    const fake = fakeFeatureHost(kernel);
    registerFeatures([connection], fake.host);
    const run = (id: string, ...args: unknown[]) =>
        vscode.commands.get(id)!(...args) as Promise<unknown>;
    const settled = () => when(kernel.connection.state, (s) => s.status !== "connecting");
    const statusBar = () => vscode.statusBarItems[0]!;
    /** The status-bar menu's labels; picks `choose` if given. */
    const menu = async (choose?: string) => {
        let labels: string[] = [];
        vscode.pickFrom = (items) => {
            labels = items.map((i) => i.label);
            return items.find((i) => i.label === choose);
        };
        await run("databricks.connection.showConnectionMenu");
        return labels;
    };
    return { kernel, file, http, run, settled, statusBar, menu, ...fake };
}

describe("signing in when something fails", () => {
    beforeEach(() => vscode.reset());
    afterEach(() => vi.unstubAllGlobals());

    it("offers 'Sign in again' for an expired OAuth session, and reconnects after auth login", async () => {
        const { kernel, settled, statusBar, menu } = setup(
            `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        let loggedIn = false;
        kernel.runner.on(["auth", "token"], () =>
            loggedIn
                ? { stdout: freshToken() }
                : {
                      exitCode: 1,
                      stderr: "Error: A new access token could not be retrieved because the refresh token is invalid.",
                  },
        );
        kernel.runner.on(["auth", "login"], () => {
            loggedIn = true;
            return {};
        });
        kernel.start();
        expect(await settled()).toMatchObject({
            status: "error",
            profile: "DEFAULT",
            remedy: "signInAgain",
        });
        expect(statusBar().text).toBe("$(warning) Databricks: DEFAULT");
        expect(statusBar().tooltip).toBe(
            `Can't connect to ${A}\nError: A new access token could not be retrieved because the refresh token is invalid.`,
        );

        const labels = await menu("$(refresh) Sign in again");
        expect(labels).toEqual([
            "$(refresh) Sign in again",
            "$(refresh) Reconnect",
            "$(sign-in) Sign in",
            "$(sign-out) Sign out",
            "$(file) Open Databricks configuration file",
        ]);
        expect(kernel.runner.argv).toContainEqual([
            "auth",
            "login",
            "--host",
            A,
            "--profile",
            "DEFAULT",
            "--timeout",
            "300s",
        ]);
        expect(vscode.progress.map((p) => p.title)).toContain(
            "Databricks: Logging in using OAuth U2M",
        );
        expect(statusBar().text).toBe("Databricks: DEFAULT");
        expect(kernel.connection.connection?.userName).toBe("user Bearer u2m-token");
    });

    it("doesn't offer 'Sign in again' when the CLI can't be started, and names the failure", async () => {
        const { kernel, settled, statusBar, menu } = setup(
            `[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        kernel.runner.on(["auth", "token"], () => {
            throw Object.assign(new Error("spawn /extension/bin/databricks ENOENT"), {
                code: "ENOENT",
            });
        });
        kernel.start();
        const s = await settled();
        expect(s).toMatchObject({ status: "error", profile: "DEFAULT", host: A });
        expect(s.status === "error" && s.remedy).toBeFalsy();
        expect(statusBar().tooltip).toBe(
            `Can't connect to ${A}\nThe Databricks CLI wasn't found at ${FAKE_CLI_PATH}. Reinstall the extension.`,
        );
        expect(await menu()).toEqual([
            "$(refresh) Reconnect",
            "$(sign-in) Sign in",
            "$(sign-out) Sign out",
            "$(file) Open Databricks configuration file",
        ]);
    });

    it("offers Reconnect in the menu of a failed connection, which reconnects as the window is now", async () => {
        const { kernel, http, settled, statusBar, run } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        let reachable = false;
        http.on("GET", SCIM_ME, () => {
            if (!reachable) {
                throw fetchFailed("ENOTFOUND");
            }
            return { body: { userName: "me" } };
        });
        kernel.start();
        expect(await settled()).toMatchObject({ status: "error", profile: "DEFAULT" });
        vscode.nextErrorChoice = undefined;

        reachable = true;
        // Picks Reconnect once: a menu that picked it again would loop.
        pickOnce(vscode, "$(refresh) Reconnect");
        await run("databricks.connection.showConnectionMenu");
        expect(kernel.connection.state.value.status).toBe("connected");
        expect(statusBar().text).toBe("Databricks: DEFAULT");
    });

    it("says why again when Reconnect fails, with the fix for it", async () => {
        const { kernel, http, settled, run } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        http.on("GET", SCIM_ME, () => {
            throw fetchFailed("ENOTFOUND");
        });
        kernel.start();
        await settled();
        vscode.errors.length = 0;

        pickOnce(vscode, "$(refresh) Reconnect");
        await run("databricks.connection.showConnectionMenu").catch(() => {});
        expect(http.to(SCIM_ME)).toHaveLength(2);
        expect(vscode.errors).toEqual([
            {
                message:
                    "Can't login with config profile DEFAULT: Can't reach a.cloud.databricks.com: the host name doesn't resolve. Check the host, or your network.",
                actions: ["Retry"],
            },
        ]);
    });

    it("offers Reconnect only while the connection has failed", async () => {
        const { kernel, settled, menu, run } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`,
        );
        kernel.start();
        expect(await settled()).toMatchObject({ status: "connected" });
        expect(await menu()).not.toContain("$(refresh) Reconnect");

        await run("databricks.connection.logout");
        expect(kernel.connection.state.value.status).toBe("signedOut");
        expect(await menu()).not.toContain("$(refresh) Reconnect");
    });

    it("shows az's own message when the Azure CLI isn't signed in", async () => {
        const { kernel, settled, statusBar } = setup(
            `[DEFAULT]\nhost = https://adb-1.2.azuredatabricks.net\nauth_type = azure-cli\nazure_tenant_id = tenant-1\n`,
        );
        kernel.runner.on(["account", "get-access-token"], {
            exitCode: 1,
            stderr: "ERROR: Please run 'az login' to setup account.\n",
        });
        kernel.start();
        expect(await settled()).toMatchObject({ status: "error", profile: "DEFAULT" });
        expect(statusBar().tooltip).toBe(
            "Can't connect to https://adb-1.2.azuredatabricks.net\nCan't get an Azure CLI token: ERROR: Please run 'az login' to setup account.",
        );
        const az = kernel.runner.calls.find((c) => c.command === "az")!;
        expect(az.args).toEqual([
            "account",
            "get-access-token",
            "--resource",
            "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d",
            "--output",
            "json",
            "--tenant",
            "tenant-1",
        ]);
        expect(az.options.shell).toBe(true);
    });

    it("reports a rejected M2M client secret", async () => {
        const { kernel, settled, statusBar } = setup(
            `[DEFAULT]\nhost = ${A}\nclient_id = sp-id\nclient_secret = wrong-secret\n`,
        );
        const fetched: string[] = [];
        // M2M's discovery and token requests are sdk-auth's own global fetch, not the connection's transport.
        vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
            fetched.push(`${init?.headers?.Authorization ? "POST" : "GET"} ${url}`);
            if (url.endsWith("/.well-known/databricks-config")) {
                return Response.json({ oidc_endpoint: `${A}/oidc` });
            }
            if (url.endsWith("/.well-known/oauth-authorization-server")) {
                return Response.json({ token_endpoint: `${A}/oidc/v1/token` });
            }
            return new Response(
                JSON.stringify({
                    error: "invalid_client",
                    error_description: "Client authentication failed",
                }),
                { status: 401 },
            );
        });
        kernel.start();
        expect(await settled()).toMatchObject({ status: "error", profile: "DEFAULT", host: A });
        expect(statusBar().tooltip).toBe(
            `Can't connect to ${A}\ntoken request failed with status 401: {"error":"invalid_client","error_description":"Client authentication failed"}`,
        );
        expect(fetched).toEqual([
            `GET ${A}/.well-known/databricks-config`,
            `GET ${A}/oidc/.well-known/oauth-authorization-server`,
            `POST ${A}/oidc/v1/token`,
        ]);
    });

    it("says the profile has no token when token is empty", async () => {
        const { kernel, settled, statusBar, http } = setup(`[DEFAULT]\nhost = ${A}\ntoken =\n`);
        kernel.start();
        expect(await settled()).toMatchObject({ status: "error", profile: "DEFAULT" });
        expect(statusBar().tooltip).toBe(`Can't connect to ${A}\nProfile 'DEFAULT' has no token.`);
        expect(http.requests).toHaveLength(0);
    });
});

describe("a sign-in's browser login", () => {
    beforeEach(() => vscode.reset());
    afterEach(() => vi.unstubAllGlobals());

    /** An expired OAuth session, whose `auth login` the test finishes or cancels by hand. */
    function expiredSession() {
        let loggedIn = false;
        const login: { finish?: () => void; cancel?: () => void } = {};
        const setup_ = setup(`[DEFAULT]\nhost = ${A}\nauth_type = databricks-cli\n`);
        setup_.kernel.runner.on(["auth", "token"], () =>
            loggedIn
                ? { stdout: freshToken() }
                : {
                      exitCode: 1,
                      stderr: "Error: A new access token could not be retrieved because the refresh token is invalid.",
                  },
        );
        setup_.kernel.runner.on(
            ["auth", "login"],
            () =>
                new Promise((resolve) => {
                    login.finish = () => {
                        loggedIn = true;
                        resolve({});
                    };
                    login.cancel = () => resolve({ cancelled: true });
                }),
        );
        return { ...setup_, login };
    }

    it("shows the row as signing in while the browser login runs, not as failed", async () => {
        const { kernel, settled, run, login } = expiredSession();
        kernel.start();
        await settled();
        const noticesBefore = vscode.errors.length;

        const signIn = run("databricks.connection.signInAgain");
        await vi.waitFor(() => expect(login.finish).toBeDefined());
        expect(kernel.connection.state.value).toMatchObject({
            status: "connecting",
            profile: "DEFAULT",
            signingIn: true,
        });
        expect(workspaceConnectionRows(kernel.connection.state.value)).toMatchObject([
            { description: "DEFAULT · Signing in…" },
        ]);
        expect(vscode.errors).toHaveLength(noticesBefore);

        login.finish?.();
        await signIn;
        expect(kernel.connection.state.value.status).toBe("connected");
    });

    /** The wizard on the existing expired profile: the path the user takes to sign in again. */
    async function signInFromWizard(s: ReturnType<typeof expiredSession>) {
        const signIn = s.run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInputOf(vscode).accept();
        await new Promise((r) => setImmediate(r));
        lastInputOf(vscode).accept("DEFAULT");
        return signIn;
    }

    it("shows the row as signing in during a wizard sign-in on an expired profile", async () => {
        const s = expiredSession();
        s.kernel.start();
        await s.settled();

        void signInFromWizard(s);
        await vi.waitFor(() => expect(s.login.finish).toBeDefined());
        s.kernel.connection.profiles.snapshot.invalidate("config file changed");
        await new Promise((r) => setTimeout(r, 500));
        expect(s.kernel.connection.state.value).toMatchObject({
            status: "connecting",
            signingIn: true,
        });
        s.login.finish?.();
    });

    it("keeps the row signing in when the config file changes during the browser login", async () => {
        const s = expiredSession();
        s.kernel.start();
        await s.settled();

        const signIn = s.run("databricks.connection.signInAgain");
        await vi.waitFor(() => expect(s.login.finish).toBeDefined());
        // The CLI writes the config file while the browser login is still open.
        s.kernel.connection.profiles.snapshot.invalidate("config file changed");
        await new Promise((r) => setTimeout(r, 500));
        expect(s.kernel.connection.state.value).toMatchObject({
            status: "connecting",
            signingIn: true,
        });
        s.login.finish?.();
        await signIn;
    });

    it("doesn't let a re-resolve that was already under way replace the row when the login starts", async () => {
        const s = expiredSession();
        s.kernel.start();
        await s.settled();

        // A config change starts a re-resolve whose check is slow; a sign-in starts before it answers.
        let answerCheck!: (response: { exitCode: number; stderr: string }) => void;
        let checks = 0;
        s.kernel.runner.on(["auth", "token"], () =>
            ++checks === 1
                ? new Promise((resolve) => (answerCheck = resolve))
                : { exitCode: 1, stderr: "Error: refresh token is invalid." },
        );
        s.kernel.connection.profiles.snapshot.invalidate("config file changed");
        await vi.waitFor(() => expect(answerCheck).toBeDefined());

        let finishLogin!: () => void;
        const signIn = s.kernel.connection.signingInWith(
            "DEFAULT",
            A,
            () => new Promise<void>((resolve) => (finishLogin = resolve)),
        );
        expect(s.kernel.connection.state.value).toMatchObject({ signingIn: true });
        answerCheck({ exitCode: 1, stderr: "Error: refresh token is invalid." });
        await new Promise((r) => setTimeout(r, 300));
        expect(s.kernel.connection.state.value).toMatchObject({
            status: "connecting",
            signingIn: true,
        });
        finishLogin();
        await signIn;
    });

    it("shows what the config says once a login is cancelled, when the config changed during it", async () => {
        const s = expiredSession();
        let fixed = false;
        s.kernel.runner.on(["auth", "token"], () =>
            fixed
                ? { stdout: freshToken() }
                : { exitCode: 1, stderr: "Error: refresh token is invalid." },
        );
        s.kernel.start();
        await s.settled();

        const signIn = s.run("databricks.connection.signInAgain");
        await vi.waitFor(() => expect(s.login.cancel).toBeDefined());
        // The CLI finished its login in the config while the browser was still open, then the user cancelled.
        fixed = true;
        s.kernel.connection.profiles.snapshot.invalidate("config file changed");
        await new Promise((r) => setTimeout(r, 500));
        expect(s.kernel.connection.state.value).toMatchObject({ signingIn: true });
        vscode.cancelProgress();
        s.login.cancel?.();
        await signIn;

        await vi.waitFor(() => expect(s.kernel.connection.state.value.status).toBe("connected"));
    });

    it("leaves the window and its saved choice alone when a new OAuth profile's login is cancelled", async () => {
        const { kernel, settled, run } = setup(`[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
        let stopLogin!: () => void;
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (stopLogin = () => resolve({ cancelled: true }))),
        );
        kernel.start();
        await settled();
        const before = kernel.state.get(NO_PROJECT_CHOICE);

        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInputOf(vscode).accept();
        await new Promise((r) => setImmediate(r));
        lastInputOf(vscode).accept("OAuth");
        await vi.waitFor(() =>
            expect(lastInputOf(vscode).title).toBe("Enter a name for the new profile"),
        );
        lastInputOf(vscode).type("newprof");
        lastInputOf(vscode).accept();
        await vi.waitFor(() => expect(stopLogin).toBeDefined());
        vscode.cancelProgress();
        stopLogin();
        await signIn;

        expect(kernel.connection.state.value).toMatchObject({
            status: "connected",
            connection: { profile: "DEFAULT" },
        });
        expect(kernel.state.get(NO_PROJECT_CHOICE)).toEqual(before);
    });

    it("leaves the window on its profile and the saved choice when a wizard login to another profile is cancelled", async () => {
        const { kernel, settled, run } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[oauth]\nhost = ${A}\nauth_type = databricks-cli\n`,
        );
        kernel.runner.on(["auth", "token", "--profile", "oauth"], {
            exitCode: 1,
            stderr: "Error: refresh token is invalid.",
        });
        let stopLogin!: () => void;
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (stopLogin = () => resolve({ cancelled: true }))),
        );
        kernel.start();
        await settled();
        expect(kernel.connection.state.value).toMatchObject({
            status: "connected",
            connection: { profile: "DEFAULT" },
        });
        const before = kernel.state.get(NO_PROJECT_CHOICE);

        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInputOf(vscode).accept();
        await new Promise((r) => setImmediate(r));
        lastInputOf(vscode).accept("oauth");
        await vi.waitFor(() => expect(stopLogin).toBeDefined());
        vscode.cancelProgress();
        stopLogin();
        await signIn;

        await vi.waitFor(() =>
            expect(kernel.connection.state.value).toMatchObject({
                status: "connected",
                connection: { profile: "DEFAULT" },
            }),
        );
        expect(kernel.state.get(NO_PROJECT_CHOICE)).toEqual(before);
    });

    it("puts the row back as it was when the browser login is cancelled", async () => {
        const { kernel, settled, run, login } = expiredSession();
        kernel.start();
        const before = await settled();
        const noticesBefore = vscode.errors.length;

        const signIn = run("databricks.connection.signInAgain");
        await vi.waitFor(() => expect(login.cancel).toBeDefined());
        expect(kernel.connection.state.value).toMatchObject({ signingIn: true });
        vscode.cancelProgress();
        login.cancel?.();

        // A cancelled sign-in is silent: the command resolves.
        await signIn;
        expect(kernel.connection.state.value).toEqual(before);
        expect(vscode.errors).toHaveLength(noticesBefore);
    });

    it("gives Select a profile in the menu no detail of its own, since the profile may be any kind", async () => {
        const { kernel, settled, run } = setup(
            "[DEFAULT]\nhost = https://accounts.cloud.databricks.com\ntoken = dapi-api\n",
        );
        kernel.start();
        await settled();
        let picked: { label: string; detail?: string }[] = [];
        vscode.pickFrom = (items) => {
            picked = items;
            return undefined;
        };
        await run("databricks.connection.showConnectionMenu");
        expect(picked.find((i) => i.label === "$(list-selection) Select a profile")).toEqual({
            label: "$(list-selection) Select a profile",
            run: expect.any(Function),
        });
    });

    it("offers Select a profile in the menu for an account API profile, as the notice does", async () => {
        const { kernel, settled, menu } = setup(
            "[DEFAULT]\nhost = https://accounts.cloud.databricks.com\ntoken = dapi-api\n",
        );
        kernel.start();
        await settled();

        expect(await menu()).toEqual([
            "$(list-selection) Select a profile",
            "$(refresh) Reconnect",
            "$(sign-in) Sign in",
            "$(sign-out) Sign out",
            "$(file) Open Databricks configuration file",
        ]);
    });
});
