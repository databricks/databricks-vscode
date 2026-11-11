import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { connection } from "./index";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
const tempDir = useTempDirs();
const pat = (name: string, host: string) => `[${name}]\nhost = ${host}\ntoken = dapi-${name}\n\n`;

/** A bundle folder whose targets are on the hosts given, the first the default. */
function setup(targets: Record<string, string>, cfg = pat("DEFAULT", A) + pat("b", B)) {
    const t = tempDir();
    const [first] = Object.keys(targets);
    t.write(
        "databricks.yml",
        `targets:\n${Object.entries(targets)
            .map(
                ([name, host]) =>
                    `  ${name}:\n${name === first ? "    default: true\n" : ""}    workspace: {host: ${host}}\n`,
            )
            .join("")}`,
    );
    const file = t.write(".databrickscfg", cfg);
    vscode.folders = [t.dir];
    const http = new FakeHttpClient().on("GET", SCIM_ME, { body: { userName: "me" } });
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
    const connectedTo = (profile: string) =>
        when(
            kernel.connection.state,
            (s) => s.status === "connected" && s.connection.profile === profile,
        );
    // Other notices, such as the one for several matching profiles, aren't this one.
    const notices = () =>
        vscode.infos.map((i) => i.message).filter((m) => m.startsWith("Switched to "));
    return { kernel, fake, connectedTo, notices };
}

describe("switching to a bundle target's workspace", () => {
    beforeEach(() => vscode.reset());

    it("says so when the project opens on another workspace than your sign-in", async () => {
        const { connectedTo, notices } = setup({ prod: B });
        await connectedTo("b");

        await vi.waitFor(() => expect(notices()).toEqual(["Switched to b to match target prod."]));
    });

    it("says so each time a target moves the window to another workspace, and not when the workspace stays", async () => {
        const { kernel, connectedTo, notices } = setup({ dev: A, prod: B, qa: A });
        await connectedTo("DEFAULT");
        expect(notices()).toEqual([]);

        await kernel.project.selectTarget("prod");
        await connectedTo("b");
        await kernel.project.selectTarget("dev");
        await connectedTo("DEFAULT");
        await kernel.project.selectTarget("qa");
        await when(kernel.project.snapshot, (s) => s.target === "qa");
        await new Promise((r) => setTimeout(r, 50));

        expect(notices()).toEqual([
            "Switched to b to match target prod.",
            "Switched to DEFAULT to match target dev.",
        ]);
    });

    it("doesn't say so for a profile you pick", async () => {
        const { kernel, connectedTo, notices } = setup(
            { prod: B },
            pat("DEFAULT", A) + pat("b", B) + pat("b2", B),
        );
        // Two profiles for B: the window asks, and the pick is yours.
        await when(kernel.connection.state, (s) => s.status === "signedOut");
        await kernel.connection.useProfile("b2");
        await connectedTo("b2");
        await new Promise((r) => setTimeout(r, 50));

        expect(notices()).toEqual([]);
    });

    it("doesn't say so with no sign-in to compare with", async () => {
        const { connectedTo, notices } = setup({ prod: B }, pat("b", B));
        await connectedTo("b");
        await new Promise((r) => setTimeout(r, 50));

        expect(notices()).toEqual([]);
    });

    it("names the target on the connection's row, which says the target decides the workspace", async () => {
        const { fake, connectedTo } = setup({ prod: B });
        await connectedTo("b");
        const [section] = fake.host.sections.list("signIn");

        expect((await section!.getChildren())[0]).toMatchObject({
            label: "Workspace connection",
            description: "b · for target prod",
            tooltip: `Signed in to ${B} with profile b\nTarget prod decides the workspace: select another target to use another one.`,
            // The menus put "Switch profile" on it, not "Switch workspace".
            contextValue: "databricks.connection.connected.target",
        });
    });
});
