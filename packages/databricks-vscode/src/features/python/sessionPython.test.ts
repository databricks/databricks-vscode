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
import { FakeMsPython, resolvedEnvironment } from "../../test-support/fakeMsPython";
import { SERVERLESS_INTERPRETER, SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import type { LogEntry } from "../../platform/log";
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
async function setup(options: { msPython?: FakeMsPython } = {}) {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-x\n`);
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n`,
    );
    const root = t.path("project");
    vscode.folders = [root];
    const msPython = (options.msPython ?? new FakeMsPython()).install();
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
    return { root, msPython, rows, log: fake.log };
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

    describe("the selection's log", () => {
        const SELECTED = "Selected the session's interpreter";
        const logged = (entries: readonly LogEntry[], message: string) =>
            entries.filter((e) => e.message === message);

        it("logs what ms-python reads back for the folder and for the window once the selection resolves", async () => {
            const msPython = new FakeMsPython({ selectOnUpdate: true });
            msPython.known = [resolvedEnvironment({ executable: SERVERLESS_INTERPRETER })];
            const s = await setup({ msPython });
            await vi.waitFor(() => expect(logged(s.log.entries, SELECTED)).toHaveLength(1));
            const [entry] = logged(s.log.entries, SELECTED);
            expect(entry).toMatchObject({
                level: "debug",
                data: [
                    {
                        interpreter: SERVERLESS_INTERPRETER,
                        ms: expect.any(Number),
                        activeForFolder: SERVERLESS_INTERPRETER,
                        activeForWindow: SERVERLESS_INTERPRETER,
                    },
                ],
            });
            // Both reads: the folder's, and the window's (no resource).
            expect(msPython.lookups).toEqual(expect.arrayContaining([s.root, ""]));
        });

        it("logs the selection only once the update resolves, with how long it took", async () => {
            const msPython = new FakeMsPython();
            let resolveUpdate: (() => void) | undefined;
            msPython.api.environments.updateActiveEnvironmentPath = () =>
                new Promise<void>((resolve) => (resolveUpdate = resolve));
            const s = await setup({ msPython });
            await vi.waitFor(() => expect(resolveUpdate).toBeDefined());
            await new Promise((r) => setTimeout(r, 60));
            expect(logged(s.log.entries, SELECTED)).toEqual([]);
            resolveUpdate!();
            await vi.waitFor(() => expect(logged(s.log.entries, SELECTED)).toHaveLength(1));
            const [entry] = logged(s.log.entries, SELECTED);
            expect(entry).toMatchObject({ data: [{ ms: expect.any(Number) }] });
            expect((entry!.data![0] as { ms: number }).ms).toBeGreaterThanOrEqual(50);
        });

        it("keeps the error log when the update is rejected, with the error, and logs no selection", async () => {
            const msPython = new FakeMsPython();
            const failure = new Error("the update was refused");
            msPython.api.environments.updateActiveEnvironmentPath = async () => {
                throw failure;
            };
            const s = await setup({ msPython });
            const message = `Can't select the interpreter ${SERVERLESS_INTERPRETER}`;
            await vi.waitFor(() => expect(logged(s.log.entries, message)).toHaveLength(1));
            const [entry] = logged(s.log.entries, message);
            expect(entry).toMatchObject({
                level: "error",
                data: [expect.objectContaining({ message: failure.message })],
            });
            expect(logged(s.log.entries, SELECTED)).toEqual([]);
        });
    });
});
