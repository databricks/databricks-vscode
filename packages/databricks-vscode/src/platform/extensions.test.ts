import { describe, expect, it } from "vitest";
import { fakeLog } from "../test-support/fakes";
import { UserFacingError } from "./errors";
import { Emitter, liveListenerCount } from "./event";
import {
    extensionDependency,
    ExtensionDependencies,
    isAtLeast,
    noExtensions,
    type ExtensionHost,
} from "./extensions";

const PYTHON = extensionDependency("ms-python.python", "Python");

/** A host whose extensions the test adds and removes; `change()` is VS Code's event. */
function fakeHost() {
    const installed = new Map<
        string,
        { isActive: boolean; exports: unknown; activate(): PromiseLike<unknown>; version?: string }
    >();
    const changed = new Emitter<void>();
    const calls: string[] = [];
    let installError: Error | undefined;
    const host: ExtensionHost = {
        get: (id) => installed.get(id),
        onDidChange: changed.event,
        install: async (id, title) => {
            calls.push(`install ${id}: ${title}`);
            if (installError !== undefined) {
                throw installError;
            }
        },
        show: async (id) => void calls.push(`show ${id}`),
    };
    const add = (
        id: string,
        exports: unknown = {},
        activate: () => PromiseLike<unknown> = async () => exports,
        version?: string,
    ) => {
        const extension = {
            isActive: false,
            exports,
            version,
            activate: async () => {
                calls.push(`activate ${id}`);
                const result = await activate();
                extension.isActive = true;
                return result;
            },
        };
        installed.set(id, extension);
    };
    return {
        host,
        calls,
        add,
        remove: (id: string) => installed.delete(id),
        change: () => changed.fire(),
        failInstalls: (e: Error) => (installError = e),
    };
}

function service() {
    const h = fakeHost();
    const log = fakeLog();
    return { ...h, log, extensions: new ExtensionDependencies(h.host, log) };
}

describe("ExtensionDependencies", () => {
    it("is available only while the extension is installed and enabled", () => {
        const s = service();
        expect(s.extensions.available(PYTHON)).toBe(false);
        s.add(PYTHON.id);
        expect(s.extensions.available(PYTHON)).toBe(true);
        expect(s.calls).toEqual([]);
    });

    it("requires it with an error that names what needs it, and offers Install", async () => {
        const s = service();
        let error: unknown;
        try {
            s.extensions.require(PYTHON, "Running a file with Databricks Connect");
        } catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(UserFacingError);
        expect(error).toMatchObject({
            code: "EXTENSION_MISSING",
            userMessage:
                "Running a file with Databricks Connect needs the Python extension (ms-python.python). Install it, or enable it if it's disabled.",
        });
        await (error as UserFacingError).actions.find((a) => a.title === "Install")!.run();
        expect(s.calls).toEqual([
            "install ms-python.python: Installing the Python extension (ms-python.python)",
        ]);

        s.add(PYTHON.id);
        expect(() =>
            s.extensions.require(PYTHON, "Running a file with Databricks Connect"),
        ).not.toThrow();
    });

    it("activates the extension only when asked, and resolves with its API", async () => {
        const s = service();
        const api = { environments: {} };
        s.add(PYTHON.id, api);
        expect(s.calls).toEqual([]);
        expect(await s.extensions.activate(PYTHON)).toBe(api);
        expect(await s.extensions.activate(PYTHON)).toBe(api);
        // Once running, its exports are used as they are.
        expect(s.calls).toEqual(["activate ms-python.python"]);
    });

    it("waits until the extension says it's ready", async () => {
        let loaded = () => {};
        const ready = new Promise<void>((resolve) => (loaded = resolve));
        const dep = extensionDependency("ms-python.python", "Python", { ready: () => ready });
        const s = service();
        s.add(dep.id, {});
        let resolved = false;
        const api = s.extensions.activate(dep).then((a) => ((resolved = true), a));
        await new Promise((r) => setTimeout(r, 10));
        expect(resolved).toBe(false);
        loaded();
        expect(await api).toEqual({});
    });

    it("uses one that starts but doesn't get ready, and logs a warning", async () => {
        const dep = extensionDependency("ms-python.python", "Python", {
            ready: () => Promise.reject(new Error("Launching Jedi language server failed")),
        });
        const s = service();
        const api = { environments: {} };
        s.add(dep.id, api);
        expect(await s.extensions.activate(dep)).toBe(api);
        expect(s.log.entries.map((e) => [e.level, e.message])).toEqual([
            ["warn", "The Python extension started with errors"],
        ]);
    });

    it("activates nothing that isn't there, and logs one that fails to start", async () => {
        const s = service();
        expect(await s.extensions.activate(PYTHON)).toBe(undefined);
        s.add(PYTHON.id, undefined, () => Promise.reject(new Error("broken")));
        expect(await s.extensions.activate(PYTHON)).toBe(undefined);
        expect(s.log.entries.map((e) => e.message)).toEqual(["Can't load the Python extension"]);
    });

    it("reports only when that extension becomes available or unavailable", () => {
        const s = service();
        const seen: string[] = [];
        const subscription = s.extensions.onDidChange(PYTHON, () =>
            seen.push(s.extensions.available(PYTHON) ? "available" : "gone"),
        );
        s.add("redhat.vscode-yaml");
        s.change();
        expect(seen).toEqual([]);

        s.add(PYTHON.id);
        // A read before VS Code's event doesn't hide the change.
        expect(s.extensions.available(PYTHON)).toBe(true);
        s.change();
        s.change();
        s.remove(PYTHON.id);
        s.change();
        expect(seen).toEqual(["available", "gone"]);

        subscription.dispose();
        s.add(PYTHON.id);
        s.change();
        expect(seen).toEqual(["available", "gone"]);
    });

    it("says why an install failed, and offers the extension's page", async () => {
        const s = service();
        s.failInstalls(new Error("the Marketplace can't be reached"));
        const error = await s.extensions.install(PYTHON).catch((e: unknown) => e);
        expect(error).toMatchObject({
            code: "EXTENSION_INSTALL_FAILED",
            userMessage:
                "The Python extension (ms-python.python) couldn't be installed: the Marketplace can't be reached",
        });
        await (error as UserFacingError).actions.find((a) => a.title === "Show extension")!.run();
        expect(s.calls.at(-1)).toBe("show ms-python.python");
    });

    it("leaves no listeners once disposed", () => {
        const before = liveListenerCount();
        const s = service();
        s.extensions.onDidChange(PYTHON, () => {});
        expect(liveListenerCount()).toBeGreaterThan(before);
        s.extensions.dispose();
        expect(liveListenerCount()).toBe(before);
    });

    it("counts an extension older than the minimum as unavailable, and an unknown version as good enough", () => {
        const dep = extensionDependency("ms-vscode-remote.remote-ssh", "Remote - SSH", {
            inPack: false,
            minVersion: "0.120.0",
        });
        const s = service();
        s.add(dep.id, {}, undefined, "0.119.0");
        expect(s.extensions.available(dep)).toBe(false);
        s.add(dep.id, {}, undefined, "0.122.2025090915");
        expect(s.extensions.available(dep)).toBe(true);
        s.add(dep.id, {}, undefined, undefined);
        expect(s.extensions.available(dep)).toBe(true);
    });

    it("asks to update one that's too old, rather than to install it", async () => {
        const dep = extensionDependency("ms-vscode-remote.remote-ssh", "Remote - SSH", {
            inPack: false,
            minVersion: "0.120.0",
        });
        const s = service();
        s.add(dep.id, {}, undefined, "0.119.0");
        let error: unknown;
        try {
            s.extensions.require(dep, "Opening the remote window");
        } catch (e) {
            error = e;
        }
        expect(error).toMatchObject({
            code: "EXTENSION_OUTDATED",
            userMessage:
                "Opening the remote window needs version 0.120.0 or later of the Remote - SSH extension (ms-vscode-remote.remote-ssh). Update it.",
        });
        await (error as UserFacingError).actions.find((a) => a.title === "Update")!.run();
        expect(s.calls).toEqual([
            "install ms-vscode-remote.remote-ssh: Installing the Remote - SSH extension (ms-vscode-remote.remote-ssh)",
        ]);
    });

    it("names what needed an extension that couldn't be installed", async () => {
        const s = service();
        s.failInstalls(new Error("offline"));
        await expect(
            s.extensions.install(PYTHON, "Running a file with Databricks Connect"),
        ).rejects.toMatchObject({
            userMessage:
                "Running a file with Databricks Connect needs the Python extension (ms-python.python), and it couldn't be installed: offline",
        });
    });

    it.each([
        ["0.120.0", true],
        ["0.122.2025090915", true],
        ["1.0.0", true],
        ["0.119.9", false],
        ["0.0.1", false],
        ["0.120.0-pre", true],
    ])("compares versions: %s is at least 0.120.0: %s", (version, expected) => {
        expect(isAtLeast(version, "0.120.0")).toBe(expected);
    });

    it("is in the extension pack unless it says otherwise", () => {
        expect(PYTHON.inPack).toBe(true);
        expect(
            extensionDependency("anysphere.remote-ssh", "Remote - SSH", { inPack: false }).inPack,
        ).toBe(false);
    });

    it("has nothing, and installs nothing, without a host", async () => {
        const extensions = new ExtensionDependencies(noExtensions, fakeLog());
        expect(extensions.available(PYTHON)).toBe(false);
        await expect(extensions.install(PYTHON)).rejects.toMatchObject({
            code: "EXTENSION_INSTALL_FAILED",
        });
        extensions.dispose();
    });
});
