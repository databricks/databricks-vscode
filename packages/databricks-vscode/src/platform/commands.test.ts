import { beforeEach, describe, expect, it } from "vitest";
import { fakeLog } from "../test-support/fakes";
import {
    CommandRegistry,
    internalCommand,
    type CommandExecution,
    type CommandHost,
} from "./commands";
import { CancelledError, UserFacingError } from "./errors";

declare module "./commands" {
    interface Scopes {
        testScope: { name: string };
    }
}

function setup() {
    const callbacks = new Map<string, (...args: unknown[]) => unknown>();
    const errors: { message: string; actions: string[] }[] = [];
    let choice: string | undefined;
    const host: CommandHost = {
        registerCommand: (id, callback) => {
            callbacks.set(id, callback);
            return { dispose: () => callbacks.delete(id) };
        },
        showErrorMessage: async (message, ...actions) => {
            errors.push({ message, actions });
            return choice;
        },
        executeCommand: async (id, ...args) => callbacks.get(id)?.(...args),
    };
    const executions: CommandExecution[] = [];
    const log = fakeLog();
    let clock = 0;
    const registry = new CommandRegistry(
        host,
        (e) => executions.push(e),
        log,
        () => (clock += 5),
    );
    const run = (id: string, ...args: unknown[]) => callbacks.get(id)!(...args);
    return {
        registry,
        run,
        callbacks,
        errors,
        executions,
        log,
        choose: (title: string) => {
            choice = title;
        },
    };
}

/** Lets the `then` chains behind rendered errors settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("CommandRegistry", () => {
    let t: ReturnType<typeof setup>;
    beforeEach(() => {
        t = setup();
    });

    it("passes the arguments through and returns the result", async () => {
        t.registry.register("databricks.test", (a: number, b: number) => a + b);
        await expect(t.run("databricks.test", 1, 2)).resolves.toBe(3);
        expect(t.executions).toEqual([{ command: "databricks.test", success: true, duration: 5 }]);
    });

    it("renders an unknown error exactly once, with the old wording", async () => {
        t.registry.register("databricks.fail", () => {
            throw new Error("boom");
        });
        await expect(t.run("databricks.fail")).resolves.toBeUndefined();
        await settle();
        expect(t.errors).toEqual([
            { message: "Error running command databricks.fail: boom", actions: [] },
        ]);
        expect(t.executions[0]?.success).toBe(false);
        expect(t.log.entries.some((e) => e.level === "error")).toBe(true);
    });

    it("renders a command failing inside another command once", async () => {
        t.registry.register("databricks.inner", () => {
            throw new Error("inner");
        });
        t.registry.register("databricks.outer", async () => t.run("databricks.inner"));
        await t.run("databricks.outer");
        await settle();
        expect(t.errors).toHaveLength(1);
    });

    it("renders a UserFacingError with its actions, and runs the picked one", async () => {
        let ran = false;
        t.registry.register("databricks.typed", () => {
            throw new UserFacingError("NO_PROFILE", "No profile for this host", {
                actions: [{ title: "Sign in", run: () => (ran = true) }],
            });
        });
        t.choose("Sign in");
        await t.run("databricks.typed");
        await settle();
        expect(t.errors).toEqual([{ message: "No profile for this host", actions: ["Sign in"] }]);
        expect(ran).toBe(true);
    });

    it("shows an error raised outside a command the same way, runs the picked action, and logs one that fails", async () => {
        const ran: string[] = [];
        const error = new UserFacingError("INSTALL_FAILED", "Can't install IPython.", {
            actions: [
                { title: "Retry", run: () => ran.push("Retry") },
                { title: "Show Logs", run: () => Promise.reject(new Error("no channel")) },
            ],
        });
        t.choose("Retry");
        await t.registry.showError(error);
        expect(t.errors).toEqual([
            { message: "Can't install IPython.", actions: ["Retry", "Show Logs"] },
        ]);
        expect(ran).toEqual(["Retry"]);

        t.choose("Show Logs");
        await expect(t.registry.showError(error)).resolves.toBeUndefined();
        expect(t.log.entries.filter((e) => e.level === "error")).toHaveLength(1);
        expect(t.executions).toEqual([]);
    });

    it("shows the error of an action that fails with one, with its own actions", async () => {
        const ran: string[] = [];
        const failed = new UserFacingError(
            "EXTENSION_INSTALL_FAILED",
            "The YAML extension couldn't be installed: offline",
            {
                actions: [{ title: "Show extension", run: () => ran.push("Show extension") }],
            },
        );
        const error = new UserFacingError(
            "EXTENSION_MISSING",
            "Bundle files need the YAML extension.",
            {
                actions: [{ title: "Install", run: () => Promise.reject(failed) }],
            },
        );
        t.choose("Install");
        await t.registry.showError(error);
        expect(t.errors.map((e) => e.message)).toEqual([
            "Bundle files need the YAML extension.",
            "The YAML extension couldn't be installed: offline",
        ]);
        expect(t.errors[1]?.actions).toEqual(["Show extension"]);

        t.choose("Show extension");
        await t.registry.showError(failed);
        expect(ran).toEqual(["Show extension"]);
    });

    it.each([
        ["CancelledError", new CancelledError()],
        ["vscode.CancellationError", Object.assign(new Error("Canceled"), { name: "Canceled" })],
        ["AbortError", Object.assign(new Error("aborted"), { name: "AbortError" })],
    ])("is silent on cancellation (%s)", async (_name, error) => {
        t.registry.register("databricks.cancel", () => Promise.reject(error));
        await expect(t.run("databricks.cancel")).resolves.toBeUndefined();
        await settle();
        expect(t.errors).toEqual([]);
        expect(t.executions[0]?.success).toBe(true);
    });

    it("passes the scope value first, then the arguments", async () => {
        t.registry.defineScope("testScope", {
            current: () => ({ name: "dev" }),
            unavailable: () => new UserFacingError("NO_SCOPE", "Open a Databricks project"),
        });
        t.registry.register<"testScope">(
            "databricks.scoped",
            (scope, force: boolean) => `${scope.name}:${force}`,
            { scope: "testScope" },
        );
        await expect(t.run("databricks.scoped", true)).resolves.toBe("dev:true");
    });

    it("offers the scope's remedy when the scope is unavailable", async () => {
        let ran = false;
        t.registry.defineScope("testScope", {
            current: () => undefined,
            unavailable: () =>
                new UserFacingError("NO_SCOPE", "Open a Databricks project", {
                    actions: [{ title: "Open a Databricks project", run: () => {} }],
                }),
        });
        t.registry.register<"testScope">("databricks.scoped", () => (ran = true), {
            scope: "testScope",
        });
        await t.run("databricks.scoped");
        await settle();
        expect(ran).toBe(false);
        expect(t.errors).toEqual([
            { message: "Open a Databricks project", actions: ["Open a Databricks project"] },
        ]);
    });

    it("refuses to register an ID twice, and forgets it on dispose", () => {
        const registration = t.registry.register("databricks.once", () => {});
        expect(() => t.registry.register("databricks.once", () => {})).toThrow(
            /already registered/,
        );
        expect(t.registry.registeredIds()).toEqual(["databricks.once"]);
        registration.dispose();
        expect(t.registry.registeredIds()).toEqual([]);
        expect(t.callbacks.has("databricks.once")).toBe(false);
    });

    it("runs an internal command with its argument and result, and resolves undefined when it fails", async () => {
        const double = internalCommand<number, number>("databricks.internal.double");
        t.registry.register(double.id, (n: number) => n * 2);
        await expect(t.registry.executeInternal(double, 21)).resolves.toBe(42);

        const fail = internalCommand<void, number>("databricks.internal.fail");
        t.registry.register(fail.id, () => {
            throw new UserFacingError("NOPE", "It failed.");
        });
        await expect(t.registry.executeInternal(fail, undefined)).resolves.toBeUndefined();
        expect(t.errors).toEqual([{ message: "It failed.", actions: [] }]);
    });
});
