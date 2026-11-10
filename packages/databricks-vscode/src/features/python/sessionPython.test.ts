import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { capabilitiesOf } from "../../kernel/host";
import { MutableState, when } from "../../platform/reactive";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { FakeMsPython } from "../../test-support/fakeMsPython";
import { SERVERLESS_INTERPRETER, SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { ENV_FILE } from "./EnvFile";
import { python } from "./index";

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();

/**
 * A project session where Python is the session's. Sessions have no project
 * of their own, so a local project stands in,
 * with the session's Python capability.
 */
async function setup() {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-x\n`);
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n`,
    );
    const root = t.path("project");
    vscode.folders = [root];
    const msPython = new FakeMsPython().install();
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: new FakeHttpClient().on("GET", SCIM_ME, { body: { userName: "me" } }),
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
    });
    kernel.runner.on(["bundle", "validate"], {
        stdout: JSON.stringify({ bundle: { name: "demo", target: "dev", mode: "development" } }),
    });
    const sessionKernel = {
        ...kernel,
        capabilities: {
            ...kernel.capabilities,
            python: capabilitiesOf(SERVERLESS_SESSION, { isCursor: false }).python,
        },
    };
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([python], { ...fake.host, kernel: sessionKernel });
    kernel.start();
    startFeatures(registered);
    await when(kernel.project.active, (p) => p !== undefined);
    await when(kernel.connection.state, (s) => s.status === "connected");
    const rows = async () =>
        (
            await Promise.all(fake.host.sections.list().map(async (s) => await s.getChildren()))
        ).flat() as ConfigurationItem[];
    return { root, msPython, rows };
}

describe("Python in a session window", () => {
    beforeEach(() => vscode.reset());

    it("selects the session's interpreter, and shows it as the project's Python, with nothing to set up", async () => {
        const s = await setup();
        await vi.waitFor(() =>
            expect(s.msPython.adopted).toEqual([
                { path: SERVERLESS_INTERPRETER, resource: undefined },
            ]),
        );
        const rows = await s.rows();
        expect(rows).toMatchObject([
            { label: "Python environment", description: "The session's (pythonEnv-0f6b3c2a)" },
        ]);
        expect(rows[0]).not.toHaveProperty("command");
    });

    it("writes no env file, installs no notebook init script, and offers no setup", async () => {
        const s = await setup();
        await new Promise((r) => setTimeout(r, 50));
        expect(fs.existsSync(path.join(s.root, ENV_FILE))).toBe(false);
        expect(vscode.infos).toEqual([]);
        expect(vscode.warnings).toEqual([]);
        expect(vscode.statusBarItems.filter((i) => i.visible)).toEqual([]);
    });
});
