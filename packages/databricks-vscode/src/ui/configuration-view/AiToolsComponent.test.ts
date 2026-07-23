/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {ThemeIcon} from "vscode";
import {
    AiToolsInstallLocation,
    AiToolsManager,
    AiToolsUpdateStatus,
} from "../../aitools/AiToolsManager";
import {resolveProviderResult} from "../../test/utils";
import {AiToolsComponent} from "./AiToolsComponent";

function createManager(
    installLocation: AiToolsInstallLocation,
    updateStatus: AiToolsUpdateStatus,
    version?: string,
    detectError?: boolean
): AiToolsManager {
    return {
        state: {installLocation, updateStatus, version, detectError},
        onDidChange: () => ({dispose() {}}),
    } as unknown as AiToolsManager;
}

async function getRoot(manager: AiToolsManager) {
    const component = new AiToolsComponent(manager);
    const items = await resolveProviderResult(component.getChildren());
    return items ?? [];
}

describe(__filename, () => {
    it("renders a setup prompt when not installed", async () => {
        const items = await getRoot(createManager(undefined, "unknown"));
        assert.strictEqual(items.length, 1);
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.notInstalled"
        );
        assert.strictEqual(row.command?.command, "databricks.aitools.install");
    });

    it("renders a retry row when detection failed with no cached location", async () => {
        const items = await getRoot(
            createManager(undefined, "unknown", undefined, true)
        );
        assert.strictEqual(items.length, 1);
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.error"
        );
        assert.ok(String(row.description).includes("Failed to check"));
        assert.strictEqual(row.command?.command, "databricks.aitools.reload");
        assert.strictEqual((row.iconPath as ThemeIcon).id, "warning");
    });

    it("shows the installed row (not the retry row) when a cached location survives an error", async () => {
        // detectError is true but a cached location is preserved -> normal row.
        const items = await getRoot(
            createManager("project", "upToDate", "0.2.9", true)
        );
        const [row] = items;
        assert.strictEqual(row.label, "AI tools");
        assert.ok(String(row.description).includes("project"));
    });

    it("renders the installed version in the subtext for a project install", async () => {
        const items = await getRoot(
            createManager("project", "upToDate", "0.2.9")
        );
        assert.strictEqual(items.length, 1);
        const [row] = items;
        assert.strictEqual(row.label, "AI tools");
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.upToDate"
        );
        assert.ok(String(row.description).includes("project"));
        assert.ok(String(row.description).includes("v0.2.9"));
    });

    it("falls back to 'Up to date' when the version is unknown", async () => {
        const items = await getRoot(createManager("project", "upToDate"));
        const [row] = items;
        assert.ok(String(row.description).includes("Up to date"));
        // Stable states use the robot icon.
        assert.strictEqual((row.iconPath as ThemeIcon).id, "hubot");
    });

    it("renders an update-available row without a click command", async () => {
        const items = await getRoot(createManager("global", "updateAvailable"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.updateAvailable"
        );
        assert.ok(String(row.description).includes("global"));
        assert.strictEqual((row.iconPath as ThemeIcon).id, "hubot");
        // Updates apply automatically; the row is not clickable.
        assert.strictEqual(row.command, undefined);
    });

    it("renders an updating spinner while auto-updating", async () => {
        const items = await getRoot(createManager("project", "updating"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.updating"
        );
        assert.ok(String(row.description).includes("Updating"));
        assert.strictEqual((row.iconPath as ThemeIcon).id, "sync~spin");
    });

    it("does not attach a click command to an up-to-date row", async () => {
        const items = await getRoot(createManager("project", "upToDate"));
        const [row] = items;
        assert.strictEqual(row.command, undefined);
    });

    it("renders a checking spinner while checking for updates", async () => {
        const items = await getRoot(createManager("project", "checking"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.checking"
        );
        assert.strictEqual((row.iconPath as ThemeIcon).id, "sync~spin");
    });

    it("uses the generic installed context value for unknown status", async () => {
        const items = await getRoot(createManager("project", "unknown"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.installed"
        );
    });

    it("returns nothing for a non-root parent", async () => {
        const component = new AiToolsComponent(
            createManager("project", "upToDate")
        );
        const children = await resolveProviderResult(
            component.getChildren({label: "AI tools"})
        );
        assert.deepStrictEqual(children, []);
    });
});
