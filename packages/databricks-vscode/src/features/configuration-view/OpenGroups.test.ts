import { beforeEach, describe, expect, it } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import { TreeItemCollapsibleState } from "vscode";
import { ConfigurationSections } from "../../platform/ui/sections";
import { StateStore } from "../../platform/state";
import { fakeFeatureHost, fakeKernel, fakeLog, fakeMemento } from "../../test-support/fakes";
import { SERVERLESS_SESSION, SESSION_REMOTE_NAME } from "../../test-support/sessionEnv";
import { env, host as vscode } from "../../test-support/vscode";
import { ConfigurationTreeDataProvider } from "./ConfigurationTreeDataProvider";
import { configurationView } from "./index";
import { OPEN_GROUPS, OpenGroups } from "./OpenGroups";

describe("the Project view's open groups", () => {
    beforeEach(() => vscode.reset());

    it("in a session window, remembers the open state in that window's own state", async () => {
        env.remoteName = SESSION_REMOTE_NAME;
        try {
            const kernel = fakeKernel({ host: SERVERLESS_SESSION });
            registerFeatures([configurationView], fakeFeatureHost(kernel).host);
            const view = vscode.treeViews.get("configurationView")!;
            view.toggle({ groupId: "resources", label: "Resources" }, false);
            await expect.poll(() => new OpenGroups(kernel.state).isOpen("resources")).toBe(false);
        } finally {
            env.remoteName = undefined;
        }
    });

    it("remembers a group the user opens or closes in the Project view, across a reload", async () => {
        const kernel = fakeKernel();
        registerFeatures([configurationView], fakeFeatureHost(kernel).host);
        const view = vscode.treeViews.get("configurationView")!;
        const variables = { groupId: "variables", label: "Variables" };
        view.toggle(variables, true);
        await expect.poll(() => new OpenGroups(kernel.state).isOpen("variables")).toBe(true);
        view.toggle(variables, false);
        await expect.poll(() => new OpenGroups(kernel.state).isOpen("variables")).toBe(false);
    });

    it("remembers what the user opened or closed, per group, across a reload", async () => {
        const memento = fakeMemento();
        const store = new StateStore({ global: fakeMemento(), workspace: memento });
        const groups = new OpenGroups(store);
        expect(groups.isOpen("resources")).toBeUndefined();

        await groups.remember("resources", false);
        await groups.remember("variables", true);
        expect(groups.isOpen("resources")).toBe(false);

        // A new store on the same memento is what a reload gives.
        const reloaded = new OpenGroups(
            new StateStore({ global: fakeMemento(), workspace: memento }),
        );
        expect(reloaded.isOpen("resources")).toBe(false);
        expect(reloaded.isOpen("variables")).toBe(true);
        expect(memento.get(OPEN_GROUPS.name)).toEqual({ resources: false, variables: true });
    });

    it("gives a group row the state the user left it in, over the state it starts in", async () => {
        const memento = fakeMemento();
        const groups = new OpenGroups(
            new StateStore({ global: fakeMemento(), workspace: memento }),
        );
        await groups.remember("variables", true);
        const provider = new ConfigurationTreeDataProvider(
            new ConfigurationSections(),
            fakeLog(),
            "configuration",
            groups,
        );
        const row = (groupId: string) => ({
            label: groupId,
            groupId,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        });
        expect(provider.getTreeItem(row("variables")).collapsibleState).toBe(
            TreeItemCollapsibleState.Expanded,
        );
        expect(provider.getTreeItem(row("resources")).collapsibleState).toBe(
            TreeItemCollapsibleState.Collapsed,
        );
    });
});
