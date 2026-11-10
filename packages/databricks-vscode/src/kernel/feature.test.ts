import { beforeEach, describe, expect, it } from "vitest";
import { internalCommand } from "../platform/commands";
import { MutableState } from "../platform/reactive";
import { fakeFeatureHost, fakeKernel, fakeLog } from "../test-support/fakes";
import { SERVERLESS_SESSION } from "../test-support/sessionEnv";
import { host as vscode } from "../test-support/vscode";
import type { Connection, ConnectionState } from "./connection/ConnectionService";
import { bindToConnection, bindToProjectSession, registerFeatures, type Feature } from "./feature";
import type { Project } from "./project/ProjectService";

const project = (root: string): Project => ({
    root,
    rootFile: `${root}/databricks.yml`,
    files: [`${root}/databricks.yml`],
    config: { variables: {}, targets: [] },
});

function lifetimes() {
    const log: string[] = [];
    const start = (name: string) => {
        log.push(`start ${name}`);
        return { dispose: () => log.push(`stop ${name}`) };
    };
    return { log, start };
}

describe("bindToProjectSession", () => {
    it("starts per project and target, and stops when either changes or the project goes away", () => {
        const active = new MutableState<Project | undefined>(undefined, (a, b) => a === b);
        const target = new MutableState<string | undefined>(undefined);
        const { log, start } = lifetimes();
        const binding = bindToProjectSession(
            { active, target },
            (s) => start(`${s.project.root}:${s.target}`),
            fakeLog(),
        );
        const a = project("/a");
        active.set(a);
        target.set("dev");
        target.set("prod");
        active.set(project("/b"));
        active.set(undefined);
        expect(log).toEqual([
            "start /a:undefined",
            "stop /a:undefined",
            "start /a:dev",
            "stop /a:dev",
            "start /a:prod",
            "stop /a:prod",
            "start /b:prod",
            "stop /b:prod",
        ]);
        binding.dispose();
    });

    it("stops the session when disposed, and logs a failing start", () => {
        const active = new MutableState<Project | undefined>(project("/a"), (a, b) => a === b);
        const target = new MutableState<string | undefined>("dev");
        const { log, start } = lifetimes();
        bindToProjectSession({ active, target }, (s) => start(s.project.root), fakeLog()).dispose();
        expect(log).toEqual(["start /a", "stop /a"]);

        const errors = fakeLog();
        bindToProjectSession(
            { active, target },
            () => {
                throw new Error("boom");
            },
            errors,
        );
        expect(errors.entries.map((e) => e.message)).toEqual(["A project-scoped start failed"]);
    });
});

describe("bindToConnection", () => {
    it("doesn't restart when only the connection's reason changes", () => {
        const api = { get: () => undefined } as unknown as Connection["api"];
        const connection = {
            profile: "DEFAULT",
            source: { kind: "defaultProfile" },
            api,
        } as Connection;
        const state = new MutableState<ConnectionState>(
            { status: "connected", connection },
            (a, b) => a === b,
        );
        const service = {
            state,
            get connection() {
                const s = state.value;
                return s.status === "connected" ? s.connection : undefined;
            },
        };
        const { log, start } = lifetimes();
        bindToConnection(service, (c) => start(c.profile!), fakeLog());
        state.set({
            status: "connected",
            connection: { ...connection, source: { kind: "onlyProfileForHost", host: "h" } },
        });
        expect(log).toEqual(["start DEFAULT"]);
        state.set({ status: "signedOut", reason: "x" });
        expect(log).toEqual(["start DEFAULT", "stop DEFAULT"]);
    });
});

describe("registerFeatures, and a feature's session entries", () => {
    const INTERNAL = internalCommand<undefined, string>("probe.internal");
    const probe: Feature = {
        id: "probe",
        session: {
            "probe.off": { unavailable: "It can't run here.", instead: "Do this instead." },
            "probe.adapted": { adapted: "It runs differently." },
            [INTERNAL.id]: { unavailable: "Nor can this.", instead: "Nor this." },
        },
        register(ctx) {
            // A scope it would fail on first, were it checked.
            ctx.commands.register("probe.off", () => "ran", { scope: "project" });
            ctx.commands.register("probe.adapted", () => "ran");
            ctx.commands.register("probe.undeclared", () => "ran");
            ctx.commands.registerInternal(INTERNAL, () => "ran");
        },
    };
    const run = (id: string) => vscode.commands.get(id)!();

    beforeEach(() => vscode.reset());

    it("refuses, in a session window, what the feature declares unavailable there, with why and what to do instead", async () => {
        const fake = fakeFeatureHost(fakeKernel({ host: SERVERLESS_SESSION }));
        const [registered] = registerFeatures([probe], fake.host);
        expect(registered!.commandIds).toEqual([
            "probe.off",
            "probe.adapted",
            "probe.undeclared",
            INTERNAL.id,
        ]);
        expect(await run("probe.off")).toBeUndefined();
        expect(await run(INTERNAL.id)).toBeUndefined();
        expect(vscode.errors).toEqual([
            { message: "It can't run here. Do this instead.", actions: [] },
            { message: "Nor can this. Nor this.", actions: [] },
        ]);
        expect(fake.executions.map((e) => [e.command, e.success])).toEqual([
            ["probe.off", false],
            [INTERNAL.id, false],
        ]);
        expect(await run("probe.adapted")).toBe("ran");
        expect(await run("probe.undeclared")).toBe("ran");
    });

    it("runs every command in a local window", async () => {
        const fake = fakeFeatureHost(fakeKernel());
        registerFeatures([probe], fake.host);
        // The project scope is checked again.
        expect(await run("probe.off")).toBeUndefined();
        expect(vscode.errors).toEqual([
            { message: "Open a Databricks project first.", actions: [] },
        ]);
        expect(await run(INTERNAL.id)).toBe("ran");
    });
});
