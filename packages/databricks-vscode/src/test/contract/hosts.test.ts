/**
 * The host contract. The extension runs in a local window
 * and in a session window, whose extension host runs on Databricks compute
 * (`kernel/host/`). Every command and view a feature contributes declares
 * how it behaves in a session window, next to the code that registers it
 * (`Feature.session`), and a session window registers the same things as a
 * local one, so the manifest contract holds in both.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURES } from "../../features";
import { UNITY_GATEWAY_UNAVAILABLE } from "../../features/unity-gateway";
import { registerFeatures, type Feature, type SessionSupport } from "../../kernel/feature";
import { capabilitiesOf, capabilityContextValues, REMOTE_MODE, type Host } from "../../kernel/host";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { host as vscode } from "../../test-support/vscode";
import { evaluateWhen } from "../../test-support/whenClause";

interface Manifest {
    contributes: {
        commands: { command: string; enablement?: string }[];
        menus: Record<string, { command?: string; submenu?: string; when?: string }[]>;
        views: Record<string, { id: string; when?: string }[]>;
        viewsWelcome: { view: string; contents: string; when?: string }[];
    };
}

const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"),
);
const contributedCommands = new Set(manifest.contributes.commands.map((c) => c.command));

interface Registrations {
    readonly feature: Feature;
    readonly commands: readonly string[];
    /** The views whose tree data provider it registered. */
    readonly views: readonly string[];
}

/** What each feature registers, one feature at a time, in a window on `host`. */
function registrations(host?: Host): Registrations[] {
    vscode.reset();
    const fake = fakeFeatureHost(fakeKernel(host !== undefined ? { host } : {}));
    return FEATURES.map((feature) => {
        const before = new Set(vscode.treeDataProviders.keys());
        const [registered] = registerFeatures([feature], fake.host);
        expect(registered!.error, feature.id).toBeUndefined();
        return {
            feature,
            commands: registered!.commandIds,
            views: [...vscode.treeDataProviders.keys()].filter((id) => !before.has(id)),
        };
    });
}

/** Every when-clause and enablement, with where it is. */
function whenClauses(): { where: string; when: string }[] {
    const { commands, menus, views, viewsWelcome } = manifest.contributes;
    return [
        ...commands.map((c) => ({ where: `command ${c.command}`, when: c.enablement })),
        ...Object.entries(menus).flatMap(([menu, items]) =>
            items.map((m) => ({ where: `${menu} ${m.command ?? m.submenu}`, when: m.when })),
        ),
        ...Object.values(views)
            .flat()
            .map((v) => ({ where: `view ${v.id}`, when: v.when })),
        ...viewsWelcome.map((w) => ({ where: `welcome ${w.view}`, when: w.when })),
    ].filter((c): c is { where: string; when: string } => c.when !== undefined);
}

describe("host contract", () => {
    it("declares the session behaviour of every command and view a feature contributes, and of nothing it doesn't register", () => {
        const problems: string[] = [];
        for (const { feature, commands, views } of registrations()) {
            const declared = Object.keys(feature.session ?? {});
            const contributed = [...commands.filter((id) => contributedCommands.has(id)), ...views];
            for (const id of contributed.filter((id) => !declared.includes(id))) {
                problems.push(`${feature.id}: ${id} has no session entry`);
            }
            for (const id of declared.filter(
                (id) => !commands.includes(id) && !views.includes(id),
            )) {
                problems.push(`${feature.id}: ${id} has a session entry but isn't registered`);
            }
        }
        expect(problems).toEqual([]);
    });

    it("says why each unavailable command or view is, and what to do instead, in sentences", () => {
        const sentence = /^[A-Z`].*[.)]$/s;
        const problems = FEATURES.flatMap((f) =>
            Object.entries(f.session ?? {}).flatMap(([id, support]: [string, SessionSupport]) => {
                if (support === "same") {
                    return [];
                }
                const texts =
                    "adapted" in support
                        ? [support.adapted]
                        : [support.unavailable, support.instead];
                return texts.filter((t) => !sentence.test(t)).map((t) => `${f.id} ${id}: "${t}"`);
            }),
        );
        expect(problems).toEqual([]);
    });

    it("registers the same commands and views in a session window as in a local one", () => {
        const ids = (all: Registrations[]) =>
            all.map((r) => ({
                feature: r.feature.id,
                commands: [...r.commands].sort(),
                views: [...r.views].sort(),
            }));
        expect(ids(registrations(SERVERLESS_SESSION))).toEqual(ids(registrations()));
    });

    it("hides what is unavailable in a session there, through capability keys, and doesn't hide what isn't", () => {
        const problems: string[] = [];
        const { commands, views, menus, viewsWelcome } = manifest.contributes;
        const check = (where: string, id: string, when: string | undefined) => {
            const support = declared.get(id);
            if (support === undefined) {
                return;
            }
            const truth = when === undefined ? true : evaluateWhen(when, inSession);
            if (isUnavailable(support) && truth !== false) {
                problems.push(`${where}: unavailable in a session, but "${when}" doesn't hide it`);
            } else if (!isUnavailable(support) && truth === false) {
                problems.push(
                    `${where}: declared ${JSON.stringify(support)}, but "${when}" hides it`,
                );
            }
        };
        for (const c of commands) {
            check(`command ${c.command}`, c.command, c.enablement);
        }
        for (const v of Object.values(views).flat()) {
            check(`view ${v.id}`, v.id, v.when);
        }
        // Buttons and context menus in a view that does show; the palette follows the enablement.
        for (const menu of ["view/title", "view/item/context"]) {
            for (const m of menus[menu] ?? []) {
                const support = m.command === undefined ? undefined : declared.get(m.command);
                if (support !== undefined && isUnavailable(support)) {
                    check(`${menu} ${m.command}`, m.command!, m.when);
                }
            }
        }
        for (const w of viewsWelcome) {
            const links = [...w.contents.matchAll(/\(command:([\w.-]+)\)/g)].map((m) => m[1]!);
            if (links.some((id) => isUnavailable(declared.get(id)))) {
                const truth = w.when === undefined ? true : evaluateWhen(w.when, inSession);
                if (truth !== false && !isUnavailable(declared.get(w.view))) {
                    problems.push(
                        `welcome ${w.view} "${w.contents}": links a command unavailable in a session`,
                    );
                }
            }
        }
        expect(problems).toEqual([]);
    });

    it("hides the palette's Start and Stop Compute in a session, as they name no cluster there", () => {
        const palette = manifest.contributes.menus.commandPalette ?? [];
        for (const id of ["databricks.cluster.start", "databricks.cluster.stop"]) {
            expect(palette.find((m) => m.command === id)?.when, id).toBe(
                "!databricks.context.host.fixedCompute",
            );
        }
    });

    it("hides Initialize new project in a session, from its palette entry, its button and both welcome entries", () => {
        const newProject = "databricks.bundle.initNewProject";
        const key = "!databricks.context.host.noNewProjects";
        const command = manifest.contributes.commands.find((c) => c.command === newProject);
        expect(command?.enablement).toBe(key);
        const button = manifest.contributes.menus["view/title"]?.find(
            (m) => m.command === newProject,
        );
        expect(button?.when).toContain(key);
        const welcome = manifest.contributes.viewsWelcome.filter((w) =>
            w.contents.includes(newProject),
        );
        expect(welcome).toHaveLength(2);
        for (const w of welcome) {
            expect(w.when, w.contents).toContain(key);
        }
        // The entries a session still has: opening or choosing a project, and opening a folder.
        for (const w of manifest.contributes.viewsWelcome.filter((w) =>
            /Select a project|Choose a project|Open folder/.test(w.contents),
        )) {
            expect(w.when ?? "", w.contents).not.toContain("noNewProjects");
        }
    });

    it("reads no when-clause that reads the mode instead of a capability", () => {
        expect(
            whenClauses().filter((c) => c.when.includes("databricks.context.remoteMode")),
        ).toEqual([]);
    });

    it("reads every when-clause of the manifest", () => {
        for (const { where, when } of whenClauses()) {
            expect(() => evaluateWhen(when, () => undefined), where).not.toThrow();
        }
        expect(evaluateWhen("a && (b || !c)", (k) => (k === "a" ? true : undefined))).toBe(
            undefined,
        );
        expect(evaluateWhen("a && (b || !c)", (k) => k !== "c")).toBe(true);
        expect(evaluateWhen("!a && b", (k) => (k === "a" ? true : undefined))).toBe(false);
        expect(
            evaluateWhen("view == x || v =~ /^a|b$/", (k, op, v) => k === "view" && v === "x"),
        ).toBe(true);
    });
});

/** Every session entry, by command or view ID. */
const declared = new Map<string, SessionSupport>(
    FEATURES.flatMap((f) => Object.entries(f.session ?? {})),
);

const isUnavailable = (support: SessionSupport | undefined): boolean =>
    typeof support === "object" && "unavailable" in support;

const sessionCapabilities = capabilitiesOf(SERVERLESS_SESSION, { isCursor: false });

/** The keys whose value a session window fixes: the host's, and Unity Gateway's, which follows its capability. */
const SESSION_KEYS = new Map<string, unknown>([
    ...capabilityContextValues(sessionCapabilities).map(
        ([key, value]) => [key.name, value] as const,
    ),
    [REMOTE_MODE.name, true],
    [UNITY_GATEWAY_UNAVAILABLE.name, !sessionCapabilities.unityGateway],
]);

/** An atom's truth in a session window: known for its keys, and false for a view it never shows. */
function inSession(key: string, op?: string, value?: string): boolean | undefined {
    if (key === "view" && op === "==" && isUnavailable(declared.get(value!))) {
        return false;
    }
    if (!SESSION_KEYS.has(key)) {
        return undefined;
    }
    const known = SESSION_KEYS.get(key);
    switch (op) {
        case undefined:
            return Boolean(known);
        case "==":
            return String(known) === value;
        case "!=":
            return String(known) !== value;
        default:
            return undefined;
    }
}
