import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../../platform/errors";
import { ExtensionDependencies } from "../../platform/extensions";
import { vscodeExtensions } from "../../platform/workspace";
import { fakeLog } from "../../test-support/fakes";
import { FakeMsPython, resolvedEnvironment } from "../../test-support/fakeMsPython";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { MsPython } from "./MsPython";

const tempDir = useTempDirs();
const msPython = (log = fakeLog()) =>
    new MsPython(new ExtensionDependencies(vscodeExtensions, log));

describe("MsPython", () => {
    beforeEach(() => vscode.reset());

    it("doesn't activate ms-python until it is first read", async () => {
        const fake = new FakeMsPython().install();
        const python = msPython();
        expect(fake.activations).toBe(0);

        await python.activeEnvironment("/project");
        await python.activeEnvironment("/project");
        expect(fake.activations).toBe(1);
        expect(fake.lookups).toEqual(["/project", "/project"]);
        python.dispose();
    });

    it("hands out ms-python's API only once ms-python has loaded, as it had when it was an extension dependency", async () => {
        const fake = new FakeMsPython().install();
        let loaded = () => {};
        fake.api.ready = new Promise<void>((resolve) => (loaded = resolve));
        const python = msPython();
        let resolved = false;
        const api = python.load().then((a) => ((resolved = true), a));
        await vi.waitFor(() => expect(fake.activations).toBe(1));
        expect(resolved).toBe(false);

        loaded();
        expect(await api).toBe(fake.api);
        python.dispose();
    });

    it("resolves the active environment when its interpreter exists", async () => {
        const executable = tempDir().write(".venv/bin/python", "");
        const fake = new FakeMsPython().install();
        fake.active = resolvedEnvironment({ executable });
        const python = msPython();

        expect((await python.activeEnvironment("/project"))?.executable.uri?.fsPath).toBe(
            executable,
        );
        python.dispose();
    });

    it("has no environment when the selected interpreter no longer exists", async () => {
        const fake = new FakeMsPython().install();
        fake.active = resolvedEnvironment({ executable: "/gone/bin/python" });
        const python = msPython();

        expect(await python.activeEnvironment("/project")).toBe(undefined);
        python.dispose();
    });

    it("has no environment without ms-python", async () => {
        const python = msPython();
        expect(await python.load()).toBe(undefined);
        expect(await python.activeEnvironment("/project")).toBe(undefined);
        python.dispose();
    });

    it("reports interpreter changes once loaded, through the settings event or else the environments event", async () => {
        for (const withSettings of [true, false]) {
            vscode.reset();
            const fake = new FakeMsPython({ withSettings }).install();
            const python = msPython();
            let changes = 0;
            python.onDidChangeInterpreter(() => changes++);
            fake.select(undefined);
            expect(changes).toBe(0);

            await python.load();
            fake.select(undefined);
            expect(changes, `withSettings: ${withSettings}`).toBe(1);
            python.dispose();
        }
    });

    it("loads ms-python installed later, and reports a change", async () => {
        const python = msPython();
        expect(await python.load()).toBe(undefined);
        let changes = 0;
        python.onDidChangeInterpreter(() => changes++);

        const fake = new FakeMsPython().install();
        vscode.extensionsChanged.fire();
        expect(changes).toBe(1);
        expect(await python.load()).toBe(fake.api);
        python.dispose();
    });

    it("logs and has no environment when ms-python fails to activate", async () => {
        vscode.extensions.set("ms-python.python", {
            isActive: false,
            exports: undefined,
            activate: () => Promise.reject(new Error("broken")),
        });
        const log = fakeLog();
        const python = msPython(log);
        expect(await python.activeEnvironment("/project")).toBe(undefined);
        expect(log.entries.map((e) => e.message)).toContain("Can't load the Python extension");
        python.dispose();
    });

    it("lists the known environments without the global interpreters (the old getAvailableEnvironments)", async () => {
        const fake = new FakeMsPython().install();
        fake.known = [
            resolvedEnvironment({ executable: "/p/.venv/bin/python" }),
            resolvedEnvironment({ executable: "/usr/bin/python3", global: true }),
        ];
        const python = msPython();
        expect((await python.availableEnvironments()).map((e) => e.path)).toEqual([
            "/p/.venv/bin/python",
        ]);
        python.dispose();
    });

    it("lists nothing without ms-python", async () => {
        const python = msPython();
        expect(await python.availableEnvironments()).toEqual([]);
        python.dispose();
    });

    it("opens ms-python's create and select flows", async () => {
        new FakeMsPython().install();
        const python = msPython();
        await python.createEnvironment();
        await python.selectInterpreter();
        expect(vscode.executed.map((e) => e.command)).toEqual([
            "python.createEnvironment",
            "python.setInterpreter",
        ]);
        python.dispose();
    });

    it("is installed only while ms-python is", () => {
        const python = msPython();
        expect(python.installed).toBe(false);
        new FakeMsPython().install();
        expect(python.installed).toBe(true);
        python.dispose();
    });

    it("says the Python extension is needed for what can't work without it, and runs nothing", async () => {
        const python = msPython();
        await expect(python.createEnvironment()).rejects.toThrow(
            "Creating a Python environment needs the Python extension",
        );
        await expect(python.selectInterpreter()).rejects.toThrow(
            "Selecting a Python interpreter needs the Python extension",
        );
        await expect(
            python.setActiveEnvironmentPath("/p/.venv/bin/python", "/p"),
        ).rejects.toMatchObject({ code: "EXTENSION_MISSING" });
        expect(vscode.executed).toEqual([]);
        python.dispose();
    });

    it("says ms-python failed to load, not that it's missing, when it's installed but broken", async () => {
        vscode.extensions.set("ms-python.python", {
            isActive: false,
            exports: undefined,
            activate: () => Promise.reject(new Error("broken")),
        });
        const python = msPython();
        const error = await python
            .setActiveEnvironmentPath("/p/.venv/bin/python", "/p")
            .catch((e: unknown) => e);
        expect(error).not.toBeInstanceOf(UserFacingError);
        expect(String(error)).toContain("failed to load");
        python.dispose();
    });
});
