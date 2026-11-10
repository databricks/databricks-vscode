import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import { Emitter } from "../../platform/event";
import {
    ConfigurationSections,
    MODELS_SECTION_ORDER,
    SECTION_ORDER,
    type ConfigurationItem,
} from "../../platform/ui/sections";
import { fakeFeatureHost, fakeKernel, fakeLog } from "../../test-support/fakes";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { host as vscode, TreeItem } from "../../test-support/vscode";
import {
    CONFIGURATION_VIEW,
    ConfigurationTreeDataProvider,
    MODELS_VIEW,
    SIGN_IN_VIEW,
} from "./ConfigurationTreeDataProvider";
import { CONFIGURATION_HAS_ROWS, configurationView, SIGN_IN_HAS_ROWS } from "./index";

const row = (label: string): ConfigurationItem =>
    new TreeItem(label) as unknown as ConfigurationItem;
const labelOf = (i: ConfigurationItem | undefined) =>
    i === undefined ? "root" : typeof i.label === "string" ? i.label : (i.label?.label ?? "");
const labels = (items: ConfigurationItem[]) => items.map(labelOf);

describe("ConfigurationTreeDataProvider", () => {
    it("has no rows without sections, so the welcome content shows", async () => {
        const provider = new ConfigurationTreeDataProvider(new ConfigurationSections(), fakeLog());
        expect(await provider.getChildren()).toEqual([]);
    });

    it("renders sections in their frozen order, whatever the order they were added in", async () => {
        const sections = new ConfigurationSections();
        sections.add({
            id: "compute",
            order: SECTION_ORDER.compute,
            getChildren: () => [row("Cluster")],
        });
        sections.add({
            id: "folder",
            order: SECTION_ORDER.localFolder,
            getChildren: () => [row("Local Folder")],
        });
        sections.add({
            id: "target",
            order: SECTION_ORDER.target,
            getChildren: async () => [row("Target")],
        });
        const provider = new ConfigurationTreeDataProvider(sections, fakeLog());
        expect(labels(await provider.getChildren())).toEqual(["Local Folder", "Target", "Cluster"]);
    });

    it("asks only the owning section for a row's children", async () => {
        const sections = new ConfigurationSections();
        const auth = row("Cluster");
        const asked: string[] = [];
        sections.add({
            id: "auth",
            order: 1,
            getChildren: (parent) => {
                asked.push(`auth:${labelOf(parent)}`);
                return parent === undefined ? [auth] : [row("Host")];
            },
        });
        sections.add({
            id: "other",
            order: 2,
            getChildren: (parent) => {
                asked.push(`other:${labelOf(parent)}`);
                return [];
            },
        });
        const provider = new ConfigurationTreeDataProvider(sections, fakeLog());
        await provider.getChildren();
        expect(labels(await provider.getChildren(auth))).toEqual(["Host"]);
        expect(asked).toEqual(["auth:root", "other:root", "auth:Cluster"]);
    });

    it("logs a failing section and still renders the others", async () => {
        const sections = new ConfigurationSections();
        sections.add({
            id: "broken",
            order: 1,
            getChildren: () => Promise.reject(new Error("no")),
        });
        sections.add({ id: "ok", order: 2, getChildren: () => [row("Target")] });
        const log = fakeLog();
        const provider = new ConfigurationTreeDataProvider(sections, log);
        expect(labels(await provider.getChildren())).toEqual(["Target"]);
        expect(log.entries.map((e) => e.message)).toContain(
            "Section broken failed to list its rows",
        );
    });

    it("refreshes when a section is added, changes, or goes away", () => {
        const sections = new ConfigurationSections();
        const provider = new ConfigurationTreeDataProvider(sections, fakeLog());
        let refreshes = 0;
        provider.onDidChangeTreeData(() => refreshes++);
        const changed = new Emitter<void>();
        const added = sections.add({
            id: "s",
            order: 1,
            getChildren: () => [],
            onDidChange: changed.event,
        });
        changed.fire();
        added.dispose();
        changed.fire();
        expect(refreshes).toBe(3);
    });

    it("rejects two sections with the same id", () => {
        const sections = new ConfigurationSections();
        sections.add({ id: "s", order: 1, getChildren: () => [] });
        expect(() => sections.add({ id: "s", order: 2, getChildren: () => [] })).toThrow(
            /already added/,
        );
    });
    it("renders only its own view's sections", async () => {
        const sections = new ConfigurationSections();
        sections.add({
            id: "compute",
            order: SECTION_ORDER.compute,
            getChildren: () => [row("Cluster")],
        });
        sections.add({
            id: "ai",
            view: "modelsAndAiTools",
            order: MODELS_SECTION_ORDER.aiTools,
            getChildren: () => [row("AI tools")],
        });
        sections.add({
            id: "ug",
            view: "modelsAndAiTools",
            order: MODELS_SECTION_ORDER.unityGateway,
            getChildren: () => [row("Unity Gateway")],
        });
        expect(
            labels(await new ConfigurationTreeDataProvider(sections, fakeLog()).getChildren()),
        ).toEqual(["Cluster"]);
        expect(
            labels(
                await new ConfigurationTreeDataProvider(
                    sections,
                    fakeLog(),
                    "modelsAndAiTools",
                ).getChildren(),
            ),
        ).toEqual(["Unity Gateway", "AI tools"]);
    });

    it("joins its sections' lines of text, in order, and has none when no section has one", () => {
        const sections = new ConfigurationSections();
        const provider = new ConfigurationTreeDataProvider(sections, fakeLog(), "modelsAndAiTools");
        sections.add({
            id: "ai",
            view: "modelsAndAiTools",
            order: 20,
            getChildren: () => [],
            message: () => "Second.",
        });
        sections.add({
            id: "quiet",
            view: "modelsAndAiTools",
            order: 15,
            getChildren: () => [],
            message: () => undefined,
        });
        expect(provider.message()).toBe("Second.");
        sections.add({
            id: "ug",
            view: "modelsAndAiTools",
            order: 10,
            getChildren: () => [],
            message: () => "First.",
        });
        sections.add({ id: "other", order: 1, getChildren: () => [], message: () => "Elsewhere." });
        expect(provider.message()).toBe("First. Second.");
        expect(
            new ConfigurationTreeDataProvider(
                new ConfigurationSections(),
                fakeLog(),
                "modelsAndAiTools",
            ).message(),
        ).toBeUndefined();
    });
});

describe("the configuration view feature", () => {
    beforeEach(() => vscode.reset());

    it("says whether the Connection and Project views have rows, for their welcome content", async () => {
        const fake = fakeFeatureHost();
        registerFeatures([configurationView], fake.host);
        const keys = fake.host.kernel.contextKeys;
        await vi.waitFor(() => expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(false));
        expect(keys.get(CONFIGURATION_HAS_ROWS)).toBe(false);
        let rows = [row("Workspace connection")];
        const changed = new Emitter<void>();
        const workspace = fake.host.sections.add({
            id: "workspace",
            view: "signIn",
            order: 10,
            getChildren: () => rows,
            onDidChange: changed.event,
        });
        await vi.waitFor(() => expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(true));
        expect(keys.get(CONFIGURATION_HAS_ROWS)).toBe(false);
        rows = [];
        changed.fire();
        await vi.waitFor(() => expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(false));
        rows = [row("Workspace connection")];
        changed.fire();
        await vi.waitFor(() => expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(true));
        workspace.dispose();
        await vi.waitFor(() => expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(false));
        fake.host.sections.add({
            id: "folder",
            order: SECTION_ORDER.localFolder,
            getChildren: () => [row("Local Folder")],
        });
        await vi.waitFor(() => expect(keys.get(CONFIGURATION_HAS_ROWS)).toBe(true));
        expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(false);
    });

    it("sets the keys for sections that were there before the feature registered", async () => {
        const fake = fakeFeatureHost();
        fake.host.sections.add({
            id: "workspace",
            view: "signIn",
            order: 10,
            getChildren: () => [row("Workspace connection")],
        });
        registerFeatures([configurationView], fake.host);
        const keys = fake.host.kernel.contextKeys;
        await vi.waitFor(() => expect(keys.get(SIGN_IN_HAS_ROWS)).toBe(true));
        expect(keys.get(CONFIGURATION_HAS_ROWS)).toBe(false);
    });

    it("sets the keys in a session window, where the Connection view is the session's", async () => {
        const kernel = fakeKernel({ host: SERVERLESS_SESSION });
        const fake = fakeFeatureHost(kernel);
        registerFeatures([configurationView], fake.host);
        fake.host.sections.add({
            id: "folder",
            order: SECTION_ORDER.localFolder,
            getChildren: () => [row("Local Folder")],
        });
        await vi.waitFor(() => expect(kernel.contextKeys.get(CONFIGURATION_HAS_ROWS)).toBe(true));
        expect(kernel.contextKeys.get(SIGN_IN_HAS_ROWS)).toBe(false);
    });

    it("keeps the latest answer when a section answers an earlier change later", async () => {
        const fake = fakeFeatureHost();
        registerFeatures([configurationView], fake.host);
        let answerLate!: (rows: ConfigurationItem[]) => void;
        const answers = [new Promise<ConfigurationItem[]>((resolve) => (answerLate = resolve))];
        const changed = new Emitter<void>();
        fake.host.sections.add({
            id: "slow",
            view: "signIn",
            order: 10,
            getChildren: () => answers.shift() ?? [],
            onDidChange: changed.event,
        });
        changed.fire();
        await new Promise((resolve) => setTimeout(resolve, 0));
        answerLate([row("Workspace connection")]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fake.host.kernel.contextKeys.get(SIGN_IN_HAS_ROWS)).toBe(false);
    });

    it("creates its three views, and keeps each one's line of text up to date", () => {
        const fake = fakeFeatureHost();
        registerFeatures([configurationView], fake.host);
        const models = vscode.treeViews.get(MODELS_VIEW)!;
        expect(vscode.treeViews.get(SIGN_IN_VIEW)!.message).toBeUndefined();
        expect(vscode.treeViews.get(CONFIGURATION_VIEW)!.message).toBeUndefined();
        expect(models.message).toBeUndefined();
        let line: string | undefined = "Sign in.";
        const changed = new Emitter<void>();
        fake.host.sections.add({
            id: "ug",
            view: "modelsAndAiTools",
            order: 10,
            getChildren: () => [],
            message: () => line,
            onDidChange: changed.event,
        });
        expect(models.message).toBe("Sign in.");
        expect(vscode.treeViews.get(CONFIGURATION_VIEW)!.message).toBeUndefined();
        line = undefined;
        changed.fire();
        expect(models.message).toBeUndefined();
    });

    it("sets each view's line of text again when the view shows, so VS Code lays out its rows", () => {
        registerFeatures([configurationView], fakeFeatureHost().host);
        for (const id of [SIGN_IN_VIEW, CONFIGURATION_VIEW, MODELS_VIEW]) {
            const view = vscode.treeViews.get(id)!;
            // VS Code acts on every assignment, even of the same value, so count them.
            const sets: (string | undefined)[] = [];
            Object.defineProperty(view, "message", {
                set: (message: string | undefined) => sets.push(message),
            });
            view.setVisible(false);
            expect(sets).toEqual([]);
            view.setVisible(true);
            expect(sets).toEqual([undefined]);
        }
    });
});
