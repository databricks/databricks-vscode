import fs from "node:fs";
import { TreeItemCollapsibleState } from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, type FakeQuickInput } from "../../test-support/vscode";
import { connection } from "./index";

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();
const tick = () => new Promise((r) => setImmediate(r));
const lastInput = (): FakeQuickInput => vscode.quickInputs[vscode.quickInputs.length - 1]!;

/** A folder with a bundle whose target `dev` points at host A, and a config file. */
function setup(cfg: string, options: { overrides?: object; targetProfile?: string } = {}) {
    const t = tempDir();
    const profile = options.targetProfile ? `, profile: ${options.targetProfile}` : "";
    t.write(
        "databricks.yml",
        `targets:\n  dev:\n    default: true\n    workspace: {host: ${A}${profile}}\n`,
    );
    if (options.overrides) {
        t.write(".databricks/bundle/dev/vscode.overrides.json", JSON.stringify(options.overrides));
    }
    const file = t.write(".databrickscfg", cfg);
    vscode.folders = [t.dir];
    const http = new FakeHttpClient().on("GET", SCIM_ME, (req) => ({
        body: { userName: `user ${req.headers.get("Authorization")}` },
    }));
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: file },
        httpClient: http,
        folders: new MutableState<readonly string[]>([t.dir]),
        files: new FakeFileEvents(),
    });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection], fake.host);
    kernel.start();
    startFeatures(registered);
    /** The Connection view's workspace row, and the rows under it. */
    const row = async () => {
        const [section] = fake.host.sections.list("signIn");
        const [top] = await section!.getChildren();
        return { ...top!, children: top ? await section!.getChildren(top) : [] };
    };
    /** The Connection view's top rows, as label and description. */
    const signInRows = async () =>
        (await Promise.all(fake.host.sections.list("signIn").map(async (s) => s.getChildren())))
            .flat()
            .map((r) => [r.label, r.description]);
    const settled = () => when(kernel.connection.state, (s) => s.status !== "connecting");
    const run = (id: string, ...args: unknown[]) =>
        vscode.commands.get(id)!(...args) as Promise<unknown>;
    const overrides = () =>
        JSON.parse(
            fs.readFileSync(t.path(".databricks/bundle/dev/vscode.overrides.json"), "utf-8"),
        );
    return { kernel, fake, t, row, signInRows, settled, run, overrides };
}

const pat = (name: string) => `[${name}]\nhost = ${A}\ntoken = dapi-${name}\n\n`;

describe("the connection in a bundle project", () => {
    beforeEach(() => vscode.reset());

    it("shows the profile the target connected with in the Connection view, and nothing in the Project view", async () => {
        const { row, settled, fake } = setup(pat("DEFAULT"));
        await settled();
        await vi.waitFor(async () =>
            expect((await row()).description).toBe("DEFAULT · for target dev"),
        );
        expect((await row()).contextValue).toBe("databricks.connection.connected.target");
        expect(fake.host.sections.list("configuration")).toEqual([]);
    });

    it("saves the only matching profile for the target, so a second one doesn't make it ambiguous", async () => {
        const { kernel, settled, overrides, t } = setup(pat("DEFAULT"));
        await settled();
        await vi.waitFor(() => expect(overrides()).toEqual({ authProfile: "DEFAULT" }));
        fs.appendFileSync(t.path(".databrickscfg"), pat("NEW_PROFILE"));
        await kernel.connection.profiles.refresh("test");
        await tick();
        expect(kernel.connection.connection?.profile).toBe("DEFAULT");
    });

    it("starts the wizard at the profiles for the target's host, and saves the choice for the target", async () => {
        const { kernel, settled, run, overrides, row } = setup(
            pat("DEFAULT") + pat("NEW_PROFILE"),
            { overrides: { authProfile: "DEFAULT" } },
        );
        await settled();
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        // The first input lists the profiles: no host step (auth.e2e.ts:84-87).
        expect(lastInput().placeholder).toBe("Select authentication method");
        expect(
            lastInput()
                .items.map((i) => i.label)
                .slice(0, 2),
        ).toEqual(["DEFAULT", "NEW_PROFILE"]);
        lastInput().accept("NEW_PROFILE");
        await signIn;
        expect(kernel.connection.connection?.profile).toBe("NEW_PROFILE");
        expect(overrides()).toEqual({ authProfile: "NEW_PROFILE" });
        expect((await row()).description).toBe("NEW_PROFILE · for target dev");
    });

    it("saves the first profile under the target's workspace.profile name, with no name prompt, when there's no profile", async () => {
        const { kernel, settled, run, t, overrides } = setup("", { targetProfile: "ws-target" });
        const overrideProfile = () => overrides().authProfile;
        const file = t.path(".databrickscfg");
        kernel.runner.on(["auth", "token"], {
            stdout: JSON.stringify({
                access_token: "u2m",
                expiry: new Date(Date.now() + 3600_000).toISOString(),
            }),
        });
        kernel.runner.on(["auth", "login"], () => {
            fs.appendFileSync(file, `\n[ws-target]\nhost = ${A}\nauth_type = databricks-cli\n`);
            return {};
        });
        await settled();
        const signIn = run("databricks.connection.configureLogin");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("OAuth (recommended)");
        await signIn;
        expect(kernel.runner.argv).toContainEqual([
            "auth",
            "login",
            "--host",
            A,
            "--profile",
            "ws-target",
            "--timeout",
            "300s",
        ]);
        await settled();
        expect(kernel.connection.state.value).toMatchObject({ status: "connected" });
        expect(kernel.connection.connection?.profile).toBe("ws-target");
        expect(overrideProfile()).toBe("ws-target");
    });

    it("switches the profile for the target from the Connection row, with no host step", async () => {
        const { kernel, settled, run, overrides } = setup(pat("DEFAULT") + pat("NEW_PROFILE"), {
            overrides: { authProfile: "DEFAULT" },
        });
        await settled();
        const switching = run("databricks.connection.switchProfile");
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        expect(lastInput().placeholder).toBe("Select authentication method");
        lastInput().accept("NEW_PROFILE");
        await switching;
        expect(kernel.connection.connection?.profile).toBe("NEW_PROFILE");
        expect(overrides()).toEqual({ authProfile: "NEW_PROFILE" });
    });

    it("prompts, without a modal, when several profiles match the host, and says so under the row", async () => {
        vscode.reset();
        vscode.nextMessageChoice = "Select a profile";
        const { kernel, settled, row } = setup(pat("DEFAULT") + pat("COPY"));
        await settled();
        await vi.waitFor(() => expect(vscode.infos).toHaveLength(1));
        expect(vscode.infos[0]).toEqual({
            message: `Profiles DEFAULT and COPY both match ${A}. Select the profile to use for target 'dev'.`,
            actions: ["Select a profile"],
        });
        expect(await row()).toMatchObject({
            label: "Workspace connection",
            description: "Select a profile",
            collapsibleState: TreeItemCollapsibleState.Expanded,
            children: [{ label: `Profiles DEFAULT and COPY both match ${A}.` }],
        });
        // "Select a profile" opens the wizard at the profiles for the host.
        await vi.waitFor(() => expect(vscode.quickInputs).toHaveLength(1));
        lastInput().accept("COPY");
        await vi.waitFor(() => expect(kernel.connection.connection?.profile).toBe("COPY"));
        expect(vscode.infos).toHaveLength(1);
    });

    it("says why under the row after signing out of the target, beside Unity Gateway's, in place of the welcome, and keeps it", async () => {
        const { kernel, settled, run, row, signInRows, overrides } = setup(pat("DEFAULT"), {
            overrides: { authProfile: "DEFAULT" },
        });
        await settled();
        await run("databricks.connection.logout");
        // In the target's file, so it survives even an abrupt restart.
        expect(overrides()).toEqual({ authProfile: "DEFAULT", signedOut: true });
        // Unity Gateway is signed out too: in a project both rows show all the same, the workspace's for its reason.
        expect(kernel.unityGateway.state.value.status).toBe("signedOut");
        expect(await row()).toMatchObject({
            description: "Not signed in",
            contextValue: "databricks.connection.signedOut.target",
            children: [{ label: "You signed out of target 'dev'." }],
        });
        expect(await signInRows()).toEqual([
            ["Workspace connection", "Not signed in"],
            ["Unity Gateway connection", "Not signed in"],
        ]);
        await kernel.connection.profiles.refresh("test");
        await tick();
        expect(kernel.connection.state.value.status).toBe("signedOut");
    });

    it("signs out of the target from its failed row, and says so", async () => {
        const { kernel, settled, run, row, overrides } = setup(`[DEFAULT]\nhost = ${A}\ntoken =\n`);
        await settled();
        expect(kernel.connection.state.value.status).toBe("error");
        expect((await row()).contextValue).toBe("databricks.connection.error.target");

        await run("databricks.connection.logout");
        expect(overrides()).toEqual({ signedOut: true });
        expect(kernel.connection.state.value).toMatchObject({
            status: "signedOut",
            reason: "You signed out of target 'dev'.",
        });
        expect((await row()).contextValue).toBe("databricks.connection.signedOut.target");
    });

    it("offers selecting a target, not a workspace switch, in a project, since the target decides the workspace", async () => {
        const { settled, run } = setup(pat("DEFAULT"));
        await settled();
        let offered: string[] = [];
        vscode.pickFrom = (items) => {
            offered = items.map((i) => i.label);
            return items.find((i) => i.label === "$(target) Select target");
        };
        await run("databricks.connection.showConnectionMenu");
        expect(offered).toEqual([
            "$(arrow-swap) Switch profile",
            "$(target) Select target",
            "$(sign-out) Sign out",
            "$(file) Open Databricks configuration file",
        ]);
        expect(vscode.executed.map((e) => e.command)).toContain(
            "databricks.connection.bundle.selectTarget",
        );
    });
});
