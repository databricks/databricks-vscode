import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixFor } from "../../kernel/connection/fix";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel, type fakeReporter } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME, type FakeResponse } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, type FakeQuickInput } from "../../test-support/vscode";
import { NO_PROJECT_CHOICE } from "../../kernel/connection/ConnectionService";
import { connection } from "./index";

/** A unified host: one URL for the account and its workspaces. */
const U = "https://u.databricks.com";
/** A classic workspace host. */
const A = "https://a.cloud.databricks.com";
const ADMIN_ONLY =
    "This API is disabled for users without account admin status. Contact your administrator for more information.";
/** What a unified host sends for an API call that reaches neither the account nor a workspace. */
const WEB_PAGE = "<!doctype html><html><body>Databricks</body></html>";
const NO_ACCESS = "999";
const UNCHECKABLE = "777";
const tempDir = useTempDirs();
const tick = () => new Promise((r) => setImmediate(r));
const lastInput = (): FakeQuickInput => vscode.quickInputs[vscode.quickInputs.length - 1]!;
const labels = (input: FakeQuickInput) => input.items.map((i) => i.label);
/** The properties of each `name` event, without their `event.` prefix. */
const events = (reporter: ReturnType<typeof fakeReporter>, name: string) =>
    reporter.events
        .filter((e) => e.name === name)
        .map((e) =>
            Object.fromEntries(
                Object.entries(e.properties ?? {})
                    .filter(([k]) => k.startsWith("event."))
                    .map(([k, v]) => [k.slice("event.".length), v]),
            ),
        );
const freshToken = JSON.stringify({
    access_token: "u2m",
    expiry: new Date(Date.now() + 3600_000).toISOString(),
});
/** A profile on another host: a sign-in in these tests names its profile. */
const ELSEWHERE = `[elsewhere]\nhost = https://elsewhere.cloud.databricks.com\nauth_type = databricks-cli\n\n`;
const accountOnly = (name: string, host = U) =>
    `[${name}]\nhost = ${host}\naccount_id = acc-1\nauth_type = databricks-cli\n\n`;
/** The account API that lists the account's workspaces. */
const WORKSPACES = "/api/2.0/accounts/acc-1/workspaces";
/**
 * A response of `WORKSPACES`: ID, name and, unless running, status. Written
 * as JSON text, so a `bigint` ID keeps digits a JS number would round.
 */
const listed = (
    ...workspaces: [id: number | bigint, name: string, status?: string][]
): FakeResponse => ({
    text: `[${workspaces
        .map(
            ([id, name, status = "RUNNING"]) =>
                `{"workspace_id": ${id}, "workspace_name": ${JSON.stringify(name)}, "workspace_status": "${status}"}`,
        )
        .join(", ")}]`,
});

/**
 * The connection feature over the real kernel and a real config file. The
 * fake host answers SCIM `Me` only with a workspace header, as a unified
 * host does; without one the request reaches the account API.
 */
function setup(
    cfg: string,
    options: {
        metadata?: "unified" | "workspace" | "down";
        /** A bundle project whose target `dev` has this `workspace.host`. */
        targetHost?: string;
        /** The account's workspace list; without it, the list isn't found. A promise holds it back. */
        workspaces?: FakeResponse | Promise<FakeResponse>;
        /** How SCIM `Me` without a workspace header fails: a 403, or a web page, as some hosts answer. */
        refusal?: "forbidden" | "webPage";
    } = {},
) {
    const t = tempDir();
    const file = t.write(".databrickscfg", cfg);
    if (options.targetHost !== undefined) {
        t.write(
            "databricks.yml",
            `targets:\n  dev:\n    default: true\n    workspace: {host: "${options.targetHost}"}\n`,
        );
        vscode.folders = [t.dir];
    }
    const http = new FakeHttpClient().on("GET", SCIM_ME, (req) => {
        const ws = req.headers.get("X-Databricks-Workspace-Id");
        if (ws === null && new URL(req.url).origin === U) {
            return options.refusal === "webPage"
                ? { text: WEB_PAGE, headers: { "content-type": "text/html; charset=utf-8" } }
                : { status: 403, body: { error_code: "PERMISSION_DENIED", message: ADMIN_ONLY } };
        }
        // Workspaces the fake user has no access to, and checks the server can't answer.
        if (ws === NO_ACCESS) {
            return { status: 404, body: { error_code: "NOT_FOUND", message: "no workspace" } };
        }
        if (ws === UNCHECKABLE) {
            return { status: 401, body: { error_code: "UNAUTHENTICATED", message: "no" } };
        }
        return { body: { userName: `user in ${ws}` } };
    });
    const metadata = options.metadata ?? "unified";
    http.on(
        "GET",
        "/.well-known/databricks-config",
        metadata === "down"
            ? { status: 503, text: "unavailable" }
            : {
                  body: {
                      oidc_endpoint: `${U}/oidc/accounts/acc-1`,
                      account_id: "acc-1",
                      host_type: metadata,
                  },
              },
    );
    const workspaces = options.workspaces;
    if (workspaces !== undefined) {
        http.on("GET", WORKSPACES, async () => workspaces);
    }
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: file },
        httpClient: http,
        ...(options.targetHost !== undefined
            ? {
                  folders: new MutableState<readonly string[]>([t.dir]),
                  files: new FakeFileEvents(),
              }
            : {}),
    });
    kernel.runner.on(["auth", "token"], { stdout: freshToken });
    // The CLI saves the workspace of `--host <host>?w=<id>` into the profile, creating it if needed.
    kernel.runner.on(["auth", "login"], (args) => {
        const host = args[args.indexOf("--host") + 1]!;
        const profile = args[args.indexOf("--profile") + 1]!;
        const ws = new URL(host).searchParams.get("w");
        const content = fs.readFileSync(file, "utf8");
        const header = `[${profile}]\n`;
        fs.writeFileSync(
            file,
            content.includes(header)
                ? content.replace(header, `${header}workspace_id = ${ws}\n`)
                : `${content}\n${header}host = ${U}\naccount_id = acc-1\n${ws ? `workspace_id = ${ws}\n` : ""}auth_type = databricks-cli\n`,
        );
        return {};
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection], fake.host);
    const run = (id: string, ...args: unknown[]) =>
        vscode.commands.get(id)!(...args) as Promise<unknown>;
    const settled = () => when(kernel.connection.state, (s) => s.status !== "connecting");
    const start = () => {
        kernel.start();
        startFeatures(registered);
    };
    /** The Connection view's workspace row, and the rows under it. */
    const row = async () => {
        const [section] = fake.host.sections.list("signIn");
        const [top] = await section!.getChildren();
        return { ...top!, children: top ? await section!.getChildren(top) : [] };
    };
    return { kernel, file, http, run, settled, start, row, ...fake };
}

describe("a profile signed in to the account, not a workspace", () => {
    beforeEach(() => vscode.reset());

    it("says so on the row and offers to select a workspace, never the account-admin error", async () => {
        const { settled, start, row, reporter } = setup(accountOnly("DEFAULT"));
        start();
        expect(await settled()).toMatchObject({
            status: "error",
            profile: "DEFAULT",
            remedy: "selectWorkspace",
        });
        expect(events(reporter, "accountOnlyProfile")).toEqual([
            { where: "connect", hostMetadata: "unified" },
        ]);
        const r = await row();
        expect(r).toMatchObject({
            description: "DEFAULT · Signed in to the account, not a workspace",
            contextValue: "databricks.connection.error.selectWorkspace",
        });
        expect(JSON.stringify(r)).not.toContain("account admin");
        expect(vscode.statusBarItems[0]!.tooltip).not.toContain("account admin");
        // At startup too, the reason is in a notice: the row has no room for it.
        expect(r.children).toEqual([]);
        expect(vscode.infos).toEqual([]);
        expect(vscode.errors).toEqual([
            {
                message: `Can't login with config profile DEFAULT: Profile 'DEFAULT' is signed in to the account on ${U}, not to one of its workspaces. Select a workspace to use with it.`,
                actions: ["Select a workspace"],
            },
        ]);
    });

    it("offers to select a workspace when the host answers the check with a web page", async () => {
        const { settled, start, row } = setup(accountOnly("DEFAULT"), { refusal: "webPage" });
        start();
        expect(await settled()).toMatchObject({ status: "error", remedy: "selectWorkspace" });
        const r = await row();
        expect(r).toMatchObject({
            description: "DEFAULT · Signed in to the account, not a workspace",
        });
        expect(JSON.stringify(r)).not.toContain("[object Object]");
    });

    it("says the host answered with a web page for a profile that names no account", async () => {
        const { settled, start, row } = setup(
            `[DEFAULT]\nhost = ${U}\nauth_type = databricks-cli\n`,
            { refusal: "webPage" },
        );
        start();
        const s = await settled();
        expect(s).toMatchObject({ status: "error" });
        expect(s.status === "error" && s.remedy).toBeFalsy();
        const r = await row();
        expect(r.tooltip).toContain(`${U} answered with a web page, not the Databricks API.`);
        expect(r.children).toEqual([]);
    });

    it("still connects on a classic host, with account_id and no workspace_id", async () => {
        const { settled, start, http } = setup(accountOnly("DEFAULT", A));
        start();
        expect(await settled()).toMatchObject({ status: "connected" });
        expect(http.to("/.well-known/databricks-config")).toEqual([]);
    });

    it("offers to select a workspace when the host metadata can't be read and the check is refused", async () => {
        const { settled, start, reporter } = setup(accountOnly("DEFAULT"), { metadata: "down" });
        start();
        expect(await settled()).toMatchObject({ status: "error", remedy: "selectWorkspace" });
        expect(events(reporter, "accountOnlyProfile")).toEqual([
            { where: "connect", hostMetadata: "unavailable" },
        ]);
    });

    it("keeps the server's error when the host says it isn't unified", async () => {
        const { settled, start } = setup(accountOnly("DEFAULT"), { metadata: "workspace" });
        start();
        const s = await settled();
        expect(s).toMatchObject({ status: "error" });
        expect(s.status === "error" && s.remedy).toBeFalsy();
        expect(s.status === "error" && s.error.message).toContain(ADMIN_ONLY);
    });

    it("says a profile on an accounts host is for account APIs, and doesn't offer it to sign in", async () => {
        const ACCOUNTS = "https://accounts.cloud.databricks.com";
        const { settled, start, row, http, run } = setup(accountOnly("DEFAULT", ACCOUNTS));
        start();
        await settled();
        expect(await row()).toMatchObject({
            description: "DEFAULT · Can't connect",
            tooltip: `Can't connect to ${ACCOUNTS}\nProfile 'DEFAULT' is for account APIs; pick a workspace profile.`,
            contextValue: "databricks.connection.error",
            children: [],
        });
        expect(http.to(SCIM_ME)).toEqual([]);

        // The current connection's host is still there, but without the profile.
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().items.map((i) => i.detail)).not.toContain("Profiles: DEFAULT");
        lastInput().accept(ACCOUNTS);
        await tick();
        expect(labels(lastInput())).not.toContain("DEFAULT");
        lastInput().hide();
        await signIn;
        // Only the startup notice, with the way out.
        expect(vscode.errors).toEqual([
            {
                message:
                    "Can't login with config profile DEFAULT: Profile 'DEFAULT' is for account APIs; pick a workspace profile.",
                actions: ["Select a profile"],
            },
        ]);
    });

    it("connects to the workspace a bundle target names with ?o=, without changing the profile", async () => {
        const cfg = accountOnly("work");
        const { kernel, file, http, settled, start, row, reporter } = setup(cfg, {
            targetHost: `${U}/?o=1234`,
        });
        start();
        expect(await settled()).toMatchObject({ status: "connected" });
        expect(http.to(SCIM_ME).at(-1)!.headers.get("X-Databricks-Workspace-Id")).toBe("1234");
        expect(kernel.connection.connection).toMatchObject({
            profile: "work",
            workspaceId: "1234",
            userName: "user in 1234",
        });
        // Child processes target the same workspace.
        expect(kernel.childEnv()).toMatchObject({
            DATABRICKS_CONFIG_PROFILE: "work",
            DATABRICKS_WORKSPACE_ID: "1234",
        });
        expect(fs.readFileSync(file, "utf8")).toBe(cfg);
        const labels = (await row()).children.map((r) => r.label);
        expect(labels).toContain("Workspace 1234 (from target dev)");
        expect(labels).not.toContain("Workspace");
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "target", outcome: "connected" },
        ]);
        expect(events(reporter, "accountOnlyProfile")).toEqual([]);
    });

    it("offers another profile for the same account and a workspace, and switches to it without a login", async () => {
        const { kernel, settled, start, run, reporter } = setup(
            accountOnly("DEFAULT") +
                `[ws]\nhost = ${U}\naccount_id = acc-1\nworkspace_id = 1234\nauth_type = databricks-cli\n\n` +
                `[other]\nhost = ${U}\naccount_id = acc-2\nworkspace_id = 99\nauth_type = databricks-cli\n`,
        );
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().placeholder).toBe("This updates profile DEFAULT");
        expect(labels(lastInput())).toEqual([
            "Use profile ws",
            "",
            "Couldn't load the account's workspaces",
            "Enter a workspace ID or URL…",
            "Create a new profile instead…",
        ]);
        lastInput().accept("Use profile ws");
        await selecting;
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "existingProfile", outcome: "connected" },
        ]);
        expect(kernel.connection.connection).toMatchObject({
            profile: "ws",
            workspaceId: "1234",
        });
        expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([]);
    });

    it("offers a workspace profile on the same host with no account_id, and switches to it without a login", async () => {
        const { kernel, settled, start, run, reporter } = setup(
            accountOnly("DEFAULT") +
                `[plain]\nhost = ${U}\nworkspace_id = 1234\nauth_type = databricks-cli\n`,
        );
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(labels(lastInput())).toEqual([
            "Use profile plain",
            "",
            "Couldn't load the account's workspaces",
            "Enter a workspace ID or URL…",
            "Create a new profile instead…",
        ]);
        lastInput().accept("Use profile plain");
        await selecting;
        expect(kernel.connection.connection).toMatchObject({
            profile: "plain",
            workspaceId: "1234",
        });
        expect(kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([]);
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "existingProfile", outcome: "connected" },
        ]);
    });

    /** Runs "Select a workspace" from the row and enters `value` as the workspace. */
    async function enterWorkspace(run: ReturnType<typeof setup>["run"], value: string) {
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type(value);
        lastInput().accept();
        return selecting;
    }
    const logins = (kernel: ReturnType<typeof setup>["kernel"]) =>
        kernel.runner.argv.filter((a) => a[1] === "login");

    it("offers a profile for the same account on another host, as before", async () => {
        const { settled, start, run } = setup(
            accountOnly("DEFAULT") +
                `[other]\nhost = https://other.cloud.databricks.com\naccount_id = acc-1\nworkspace_id = 555\nauth_type = databricks-cli\n`,
            { workspaces: listed([1234, "dev"], [4444, "old"]) },
        );
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(labels(lastInput())).toContain("dev"));
        expect(labels(lastInput())).toContain("Use profile other");
        lastInput().hide();
        await selecting;
    });

    it("picks the only workspace when a profile on another host names it with no account_id, as that profile isn't offered", async () => {
        const { kernel, settled, start, run } = setup(
            accountOnly("DEFAULT") +
                `[far]\nhost = https://far.cloud.databricks.com\nworkspace_id = 1234\nauth_type = databricks-cli\n`,
            { workspaces: listed([1234, "dev"]) },
        );
        start();
        await settled();
        await run("databricks.connection.selectWorkspace");
        expect(vscode.infos.map((i) => i.message)).toEqual([
            "Using workspace dev (1234), the only one in the account. This updates profile DEFAULT.",
        ]);
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
    });

    it("leaves out a profile with no workspace, and one on another host with no account_id", async () => {
        const { settled, start, run } = setup(
            accountOnly("DEFAULT") +
                `[bare]\nhost = ${U}\nauth_type = databricks-cli\n\n` +
                `[far]\nhost = https://far.cloud.databricks.com\nworkspace_id = 555\nauth_type = databricks-cli\n`,
            { workspaces: listed([1234, "dev"], [4444, "old"]) },
        );
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(labels(lastInput())).toContain("dev"));
        expect(labels(lastInput()).filter((l) => l.startsWith("Use profile"))).toEqual([]);
        lastInput().hide();
        await selecting;
    });

    it("doesn't pick the account's only workspace by itself when a profile on this host names it", async () => {
        const { kernel, settled, start, run } = setup(
            accountOnly("DEFAULT") +
                `[plain]\nhost = ${U}\nworkspace_id = 1234\nauth_type = databricks-cli\n`,
            { workspaces: listed([1234, "dev"]) },
        );
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(labels(lastInput())).toContain("Use profile plain"));
        expect(vscode.infos).toEqual([]);
        expect(logins(kernel)).toEqual([]);
        lastInput().accept("Use profile plain");
        await selecting;
        expect(kernel.connection.connection).toMatchObject({
            profile: "plain",
            workspaceId: "1234",
        });
    });

    it("saves a typed workspace ID into the profile through the CLI, then connects", async () => {
        const { kernel, settled, start, http, file, run } = setup(accountOnly("DEFAULT"));
        start();
        await settled();
        await enterWorkspace(run, "1234");
        // Checked before the login, with the profile's credentials.
        expect(http.to(SCIM_ME).map((r) => r.headers.get("X-Databricks-Workspace-Id"))).toContain(
            "1234",
        );
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
        expect(fs.readFileSync(file, "utf8")).toContain("workspace_id = 1234");
        expect(kernel.connection.connection).toMatchObject({
            profile: "DEFAULT",
            workspaceId: "1234",
            userName: "user in 1234",
        });
    });

    it("gives back the saved choice when a sign-in to an account-only profile's workspace is cancelled", async () => {
        const { kernel, settled, start, run } = setup(
            `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n${accountOnly("acct")}`,
        );
        let stopLogin!: () => void;
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (stopLogin = () => resolve({ cancelled: true }))),
        );
        start();
        await settled();
        expect(kernel.connection.state.value).toMatchObject({
            status: "connected",
            connection: { profile: "DEFAULT" },
        });
        const before = kernel.state.get(NO_PROJECT_CHOICE);

        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept(U);
        await tick();
        lastInput().accept("acct");
        await vi.waitFor(() =>
            expect(labels(lastInput())).toContain("Enter a workspace ID or URL…"),
        );
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
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

    it("shows the row as signing in during the browser login for a typed workspace, though the CLI writes the config meanwhile", async () => {
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"));
        let finish!: () => void;
        kernel.runner.on(
            ["auth", "login"],
            () => new Promise((resolve) => (finish = () => resolve({}))),
        );
        start();
        await settled();

        const selecting = enterWorkspace(run, "1234");
        await vi.waitFor(() => expect(finish).toBeDefined());
        kernel.connection.profiles.snapshot.invalidate("config file changed");
        await new Promise((r) => setTimeout(r, 500));
        expect(kernel.connection.state.value).toMatchObject({
            status: "connecting",
            profile: "DEFAULT",
            signingIn: true,
        });
        finish();
        await selecting.catch(() => {});
    });

    it("asks again, with no login, for a workspace the user has no access to", async () => {
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"));
        start();
        await settled();
        const selecting = enterWorkspace(run, NO_ACCESS);
        await vi.waitFor(() =>
            expect(lastInput().validationMessage).toBe(`No access to workspace ${NO_ACCESS}`),
        );
        expect(logins(kernel)).toEqual([]);
        lastInput().type("1234");
        lastInput().accept();
        await selecting;
        expect(logins(kernel)).toHaveLength(1);
        expect(kernel.connection.connection?.workspaceId).toBe("1234");
    });

    it("goes on with the sign-in when the ID can't be checked", async () => {
        const { kernel, settled, start, run, file } = setup(accountOnly("DEFAULT"));
        start();
        await settled();
        await enterWorkspace(run, UNCHECKABLE);
        expect(logins(kernel)[0]).toContain(`${U}?w=${UNCHECKABLE}`);
        expect(fs.readFileSync(file, "utf8")).toContain(`workspace_id = ${UNCHECKABLE}`);
    });

    it("takes a pasted workspace URL, rejects one for another host inline, and opens the host in the browser", async () => {
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"));
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        const input = lastInput();
        const open = input.buttons.find(
            (b) => (b as { tooltip?: string }).tooltip === `Open ${U} in the browser`,
        );
        input.triggerButton(open);
        expect(vscode.opened).toEqual([U]);

        input.type("https://a.cloud.databricks.com/?o=1234");
        input.accept();
        await vi.waitFor(() =>
            expect(input.validationMessage).toBe(`This URL is for ${A}, not ${U}`),
        );
        input.type(`${U}/browse?o=4321`);
        input.accept();
        await selecting;
        expect(logins(kernel)[0]).toContain(`${U}?w=4321`);
    });

    it("creates a new profile instead, keeping the account profile as it is", async () => {
        const cfg = accountOnly("DEFAULT") + accountOnly("DEFAULT-taken");
        const { kernel, settled, start, run, file } = setup(cfg);
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("Create a new profile instead…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await vi.waitFor(() => expect(lastInput().value).toBe("DEFAULT-1234"));
        lastInput().type("DEFAULT-taken");
        lastInput().accept();
        await vi.waitFor(() =>
            expect(lastInput().validationMessage).toMatchObject({
                message: "Profile DEFAULT-taken already exists",
            }),
        );
        lastInput().type("DEFAULT-1234");
        lastInput().accept();
        await selecting;
        expect(logins(kernel)).toEqual([
            [
                "auth",
                "login",
                "--host",
                `${U}?w=1234`,
                "--profile",
                "DEFAULT-1234",
                "--timeout",
                "300s",
            ],
        ]);
        expect(fs.readFileSync(file, "utf8")).toContain(cfg.trim());
        expect(kernel.connection.connection).toMatchObject({
            profile: "DEFAULT-1234",
            workspaceId: "1234",
        });
    });

    it("offers the account's running workspaces by name or ID, and saves the one picked", async () => {
        const { kernel, settled, start, run, http, reporter } = setup(accountOnly("DEFAULT"), {
            workspaces: listed(
                [5678, "prod"],
                [1234, "dev"],
                [4444, "new", "PROVISIONING"],
                // Too large for a JS number, which would round it to another workspace's ID.
                [2n ** 53n + 1n, "huge"],
            ),
        });
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        const input = lastInput();
        // The choice opens before the list arrives.
        await vi.waitFor(() => expect(labels(input)).toContain("dev"));
        expect(labels(input)).toEqual([
            "dev",
            "huge",
            "prod",
            "",
            "Enter a workspace ID or URL…",
            "Create a new profile instead…",
        ]);
        expect(input.items[0]).toMatchObject({ description: "1234" });
        expect(input.items[1]).toMatchObject({ description: "9007199254740993" });
        expect(input.matchOnDescription).toBe(true);
        // Listed at the account, with the profile's credentials.
        const [request] = http.to(WORKSPACES);
        expect(request!.headers.get("Authorization")).toBe("Bearer u2m");
        expect(request!.headers.get("X-Databricks-Workspace-Id")).toBeNull();

        input.accept("prod");
        await selecting;
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=5678`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
        expect(kernel.connection.connection).toMatchObject({
            profile: "DEFAULT",
            workspaceId: "5678",
        });
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "list", outcome: "connected" },
        ]);
    });

    it("picks the account's only workspace by itself, and says which", async () => {
        const { kernel, settled, start, run, reporter } = setup(accountOnly("DEFAULT"), {
            workspaces: listed([1234, "dev"], [4444, "old", "FAILED"]),
        });
        start();
        await settled();
        await run("databricks.connection.selectWorkspace");
        // The choice opened at once, and the list picked its one workspace.
        expect(vscode.quickInputs.map((i) => i.visible)).toEqual([false]);
        expect(vscode.infos).toEqual([
            {
                message:
                    "Using workspace dev (1234), the only one in the account. This updates profile DEFAULT.",
                actions: [],
            },
        ]);
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
        expect(kernel.connection.connection).toMatchObject({
            profile: "DEFAULT",
            workspaceId: "1234",
        });
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "list", outcome: "connected" },
        ]);
    });

    it("offers the profile that already names the account's only workspace, rather than picking it", async () => {
        const { kernel, settled, start, run } = setup(
            accountOnly("DEFAULT") +
                `[ws]\nhost = ${U}\naccount_id = acc-1\nworkspace_id = 1234\nauth_type = databricks-cli\n\n`,
            { workspaces: listed([1234, "dev"]) },
        );
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(labels(lastInput())).toContain("dev"));
        expect(labels(lastInput())).toEqual([
            "Use profile ws",
            "",
            "dev",
            "",
            "Enter a workspace ID or URL…",
            "Create a new profile instead…",
        ]);
        lastInput().accept("Use profile ws");
        await selecting;
        expect(vscode.infos).toEqual([]);
        expect(logins(kernel)).toEqual([]);
        expect(kernel.connection.connection).toMatchObject({ profile: "ws" });
    });

    it("says the list can't be loaded, after one try, when the account's workspaces can't be listed", async () => {
        const { settled, start, run, http } = setup(accountOnly("DEFAULT"), {
            workspaces: {
                status: 503,
                body: { error_code: "TEMPORARILY_UNAVAILABLE", message: "UNAVAILABLE" },
            },
        });
        start();
        await settled();
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        await vi.waitFor(() => expect(lastInput().busy).toBe(false));
        expect(labels(lastInput())).toEqual([
            "Couldn't load the account's workspaces",
            "Enter a workspace ID or URL…",
            "Create a new profile instead…",
        ]);
        expect(http.to(WORKSPACES)).toHaveLength(1);
        lastInput().hide();
        await selecting;
        // Only the startup notice: the list's failure is shown in the choice, not as an error.
        expect(vscode.errors.map((e) => e.message)).toEqual([
            `Can't login with config profile DEFAULT: Profile 'DEFAULT' is signed in to the account on ${U}, not to one of its workspaces. Select a workspace to use with it.`,
        ]);
    });

    /** The sign-in wizard up to its workspace choice: host U, then OAuth. */
    async function wizardToChoice(run: ReturnType<typeof setup>["run"]) {
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().type(U);
        await tick();
        lastInput().accept(U);
        await tick();
        lastInput().accept("OAuth (recommended)");
        await vi.waitFor(() => expect(lastInput().title).toBe("Select a workspace"));
        // Wrapped: an async function returning the promise would wait for it.
        return { signIn };
    }

    it("asks for the workspace in the wizard before the browser login, and logs in once", async () => {
        const { kernel, settled, start, run, reporter } = setup(ELSEWHERE);
        start();
        await settled();
        const { signIn } = await wizardToChoice(run);
        expect(labels(lastInput())).toEqual([
            "Enter a workspace ID or URL…",
            "I don't know, sign in first",
        ]);
        expect(logins(kernel)).toEqual([]);
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await vi.waitFor(() => expect(lastInput().title).toBe("Enter a name for the new profile"));
        lastInput().type("work");
        lastInput().accept();
        await signIn;
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "work", "--timeout", "300s"],
        ]);
        expect(kernel.connection.connection).toMatchObject({
            profile: "work",
            workspaceId: "1234",
        });
        expect(events(reporter, "accountOnlyProfile")).toEqual([
            { where: "wizard", hostMetadata: "unified" },
        ]);
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "typed", outcome: "connected" },
        ]);
    });

    it("signs in to a unified host's workspace with no name, as DEFAULT, when there's no profile", async () => {
        const { kernel, settled, start, run } = setup("");
        start();
        await settled();
        const { signIn } = await wizardToChoice(run);
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await signIn;
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
        expect(kernel.connection.connection).toMatchObject({
            profile: "DEFAULT",
            workspaceId: "1234",
        });
    });

    it("signs in first when the user doesn't know the workspace, then asks", async () => {
        const { kernel, settled, start, run } = setup(ELSEWHERE);
        start();
        await settled();
        const { signIn } = await wizardToChoice(run);
        lastInput().accept("I don't know, sign in first");
        await vi.waitFor(() => expect(lastInput().title).toBe("Enter a name for the new profile"));
        lastInput().type("work");
        lastInput().accept();
        // Signed in to the account: the choice comes back, for the profile just made.
        await vi.waitFor(() => expect(lastInput().placeholder).toBe("This updates profile work"));
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", U, "--profile", "work", "--timeout", "300s"],
        ]);
        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await signIn;
        expect(logins(kernel)[1]).toContain(`${U}?w=1234`);
        expect(kernel.connection.connection).toMatchObject({
            profile: "work",
            workspaceId: "1234",
        });
    });

    it("lists the account's workspaces once signed in first", async () => {
        const { kernel, settled, start, run, reporter } = setup(ELSEWHERE, {
            workspaces: listed([1234, "dev"]),
        });
        start();
        await settled();
        const { signIn } = await wizardToChoice(run);
        lastInput().accept("I don't know, sign in first");
        await vi.waitFor(() => expect(lastInput().title).toBe("Enter a name for the new profile"));
        lastInput().type("work");
        lastInput().accept();
        await signIn;
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", U, "--profile", "work", "--timeout", "300s"],
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "work", "--timeout", "300s"],
        ]);
        expect(vscode.infos.map((i) => i.message)).toContain(
            "Using workspace dev (1234), the only one in the account. This updates profile work.",
        );
        expect(kernel.connection.connection).toMatchObject({
            profile: "work",
            workspaceId: "1234",
        });
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "list", outcome: "connected" },
        ]);
    });
});

describe("a personal access token profile with no workspace, on a unified host", () => {
    beforeEach(() => vscode.reset());
    const PAT_PROFILE = `[PAT]\nhost = ${U}\nauth_type = pat\ntoken = dapi-x\n\n`;
    const NO_WORKSPACE = "names no workspace on";

    it("says it names no workspace, not the server's account-admin error, and offers Select a profile", async () => {
        const { kernel, settled, start, row } = setup(PAT_PROFILE);
        start();
        await settled();
        const s = await kernel.connection.useProfile("PAT");
        expect(s).toMatchObject({ status: "error", profile: "PAT" });
        expect(s.status === "error" && s.error.message).toContain(NO_WORKSPACE);
        expect(s.status === "error" && s.error.message).not.toContain(ADMIN_ONLY);
        expect(s.status === "error" && s.remedy).toBeFalsy();
        expect(s.status === "error" && fixFor(s)).toEqual({
            kind: "selectProfile",
            title: "Select a profile",
        });
        expect(JSON.stringify(await row())).not.toContain("selectWorkspace");
    });

    it("says so when switching to the profile, too", async () => {
        const { kernel, settled, start } = setup(
            `[CLASSIC]\nhost = ${A}\nauth_type = pat\ntoken = dapi-y\n\n${PAT_PROFILE}`,
        );
        start();
        await settled();
        const s = await kernel.connection.useProfile("PAT");
        expect(s).toMatchObject({ status: "error", profile: "PAT" });
        expect(s.status === "error" && s.error.message).toContain(NO_WORKSPACE);
        expect(s.status === "error" && s.remedy).toBeFalsy();
    });

    it("keeps the server's error for a token profile when the host says it isn't unified", async () => {
        const { kernel, settled, start } = setup(PAT_PROFILE, { metadata: "workspace" });
        start();
        await settled();
        const s = await kernel.connection.useProfile("PAT");
        expect(s.status === "error" && s.error.message).toContain(ADMIN_ONLY);
        expect(s.status === "error" && s.error.message).not.toContain(NO_WORKSPACE);
    });

    it("keeps the server's error when the host metadata can't be read", async () => {
        const { kernel, settled, start } = setup(PAT_PROFILE, { metadata: "down" });
        start();
        await settled();
        const s = await kernel.connection.useProfile("PAT");
        expect(s.status === "error" && s.error.message).toContain(ADMIN_ONLY);
        expect(s.status === "error" && s.error.message).not.toContain(NO_WORKSPACE);
    });
});

describe("the workspace choice while the account's workspaces load", () => {
    beforeEach(() => vscode.reset());

    /** The list's response, held back until the test releases it. */
    function heldList() {
        let release!: (response: FakeResponse) => void;
        const response = new Promise<FakeResponse>((resolve) => (release = resolve));
        return { response, release };
    }

    const logins = (kernel: ReturnType<typeof setup>["kernel"]) =>
        kernel.runner.argv.filter((a) => a[1] === "login");

    /** Runs "Select a workspace" and waits until the choice is open. Wrapped: an async function returning the promise would wait for it. */
    async function openChoice(run: ReturnType<typeof setup>["run"]) {
        const selecting = run("databricks.connection.selectWorkspace");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        return { selecting };
    }

    it("opens at once, busy, and adds the running workspaces when the list arrives", async () => {
        const held = heldList();
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"), {
            workspaces: held.response,
        });
        start();
        await settled();
        const { selecting } = await openChoice(run);
        const input = lastInput();
        expect(input.busy).toBe(true);
        expect(labels(input)).toEqual([
            "Enter a workspace ID or URL…",
            "Create a new profile instead…",
        ]);

        held.release(listed([5678, "prod"], [1234, "dev"]));
        await vi.waitFor(() =>
            expect(labels(input)).toEqual([
                "dev",
                "prod",
                "",
                "Enter a workspace ID or URL…",
                "Create a new profile instead…",
            ]),
        );
        expect(input.busy).toBe(false);
        expect(input.visible).toBe(true);
        expect(input.matchOnDescription).toBe(true);
        expect(input.items[0]).toMatchObject({ description: "1234" });

        input.accept("prod");
        await selecting;
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=5678`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
    });

    it("says the list can't be loaded when it fails, and still takes a typed ID", async () => {
        const held = heldList();
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"), {
            workspaces: held.response,
        });
        start();
        await settled();
        const { selecting } = await openChoice(run);
        const input = lastInput();
        const before = labels(input);
        const errors = vscode.errors.length;

        held.release({
            status: 503,
            body: { error_code: "TEMPORARILY_UNAVAILABLE", message: "UNAVAILABLE" },
        });
        await vi.waitFor(() => expect(input.busy).toBe(false));
        expect(labels(input)).toEqual(["Couldn't load the account's workspaces", ...before]);
        expect(input.visible).toBe(true);
        expect(vscode.errors).toHaveLength(errors);
        expect(vscode.infos).toEqual([]);

        // Still usable: typing an ID goes on as before.
        input.accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await selecting;
        expect(logins(kernel)).toHaveLength(1);
    });

    it("keeps working on a typed ID while the list loads, and ignores the list once the choice is over", async () => {
        const held = heldList();
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"), {
            workspaces: held.response,
        });
        start();
        await settled();
        const { selecting } = await openChoice(run);
        expect(lastInput().busy).toBe(true);

        lastInput().accept("Enter a workspace ID or URL…");
        await tick();
        lastInput().type("1234");
        lastInput().accept();
        await selecting;
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);

        // A single workspace arriving now must not start a second login.
        held.release(listed([1234, "dev"]));
        await tick();
        expect(logins(kernel)).toHaveLength(1);
        expect(vscode.infos).toEqual([]);
    });

    it("picks the single workspace for the user when it arrives before they do anything", async () => {
        const held = heldList();
        const { kernel, settled, start, run, reporter } = setup(accountOnly("DEFAULT"), {
            workspaces: held.response,
        });
        start();
        await settled();
        const { selecting } = await openChoice(run);
        held.release(listed([1234, "dev"]));
        await selecting;
        expect(vscode.infos).toEqual([
            {
                message:
                    "Using workspace dev (1234), the only one in the account. This updates profile DEFAULT.",
                actions: [],
            },
        ]);
        expect(logins(kernel)).toEqual([
            ["auth", "login", "--host", `${U}?w=1234`, "--profile", "DEFAULT", "--timeout", "300s"],
        ]);
        expect(events(reporter, "workspaceSelection")).toEqual([
            { source: "list", outcome: "connected" },
        ]);
    });

    it("only adds the single workspace when it arrives after the user has typed", async () => {
        const held = heldList();
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"), {
            workspaces: held.response,
        });
        start();
        await settled();
        const { selecting } = await openChoice(run);
        lastInput().type("d");
        held.release(listed([1234, "dev"]));
        await vi.waitFor(() => expect(labels(lastInput())).toContain("dev"));
        expect(lastInput().busy).toBe(false);
        expect(lastInput().visible).toBe(true);
        expect(vscode.infos).toEqual([]);
        expect(logins(kernel)).toEqual([]);

        lastInput().accept("dev");
        await selecting;
        expect(logins(kernel)).toHaveLength(1);
    });

    it("only adds the single workspace when it arrives after the user has moved to another item", async () => {
        const held = heldList();
        const { kernel, settled, start, run } = setup(accountOnly("DEFAULT"), {
            workspaces: held.response,
        });
        start();
        await settled();
        const { selecting } = await openChoice(run);
        // Off the first item, which is where the focus starts.
        lastInput().move("Create a new profile instead…");
        held.release(listed([1234, "dev"]));
        await vi.waitFor(() => expect(labels(lastInput())).toContain("dev"));
        expect(lastInput().visible).toBe(true);
        expect(vscode.infos).toEqual([]);
        expect(logins(kernel)).toEqual([]);

        lastInput().accept("dev");
        await selecting;
        expect(logins(kernel)).toHaveLength(1);
    });
});
