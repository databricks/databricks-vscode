import { describe, expect, it } from "vitest";
import { ThemeIcon, TreeItemCollapsibleState } from "../../test-support/vscode";
import { AiToolsSection } from "./AiToolsSection";
import type { AiToolsAgentStatus, AiToolsState, AiToolsUpdateStatus } from "./model";

const noEvent = () => ({ dispose: () => {} });
const section = (state: Partial<AiToolsState>, isCursor = false) =>
    new AiToolsSection(
        () => ({ updateStatus: "unknown", detectError: false, agents: [], ...state }),
        isCursor,
        noEvent,
    );
const icon = (item: { iconPath?: unknown }) => (item.iconPath as ThemeIcon | undefined)?.id;

const agent = (overrides: Partial<AiToolsAgentStatus>): AiToolsAgentStatus => ({
    displayName: "Claude Code",
    id: "claude-code",
    type: "plugin",
    detected: true,
    supportsProjectScope: true,
    ...overrides,
});

/** The rows below "AI tools", and below "Agents". */
function children(s: AiToolsSection) {
    const [root] = s.getChildren();
    const rows = s.getChildren(root);
    const agents = rows.find((r) => r.label === "Agents");
    return { root: root!, rows, agents: agents === undefined ? [] : s.getChildren(agents) };
}

describe("AiToolsSection", () => {
    it("offers the install when nothing is installed", () => {
        const [row] = section({}).getChildren();
        expect(row).toMatchObject({
            label: "Install AI tools",
            contextValue: "databricks.configuration.aitools.notInstalled",
            collapsibleState: TreeItemCollapsibleState.None,
            command: { command: "databricks.aitools.install" },
        });
        expect(icon(row!)).toBe("hubot");
    });

    it("shows a retry row when detection failed, even with a saved location", () => {
        for (const installLocation of [undefined, "project"] as const) {
            const s = section({
                detectError: true,
                ...(installLocation ? { installLocation } : {}),
            });
            const [row] = s.getChildren();
            expect(row).toMatchObject({
                label: "AI tools",
                description: "Failed to check installation · click to retry",
                contextValue: "databricks.configuration.aitools.error",
                command: { command: "databricks.aitools.reload" },
            });
            expect(s.getChildren(row)).toEqual([]);
        }
    });

    it.each<[AiToolsUpdateStatus, string | undefined, string, string]>([
        ["upToDate", "v0.2.10", "upToDate", "hubot"],
        ["updateAvailable", "Update available", "updateAvailable", "hubot"],
        ["checking", "Checking for updates", "checking", "sync~spin"],
        ["updating", "Updating", "updating", "sync~spin"],
        ["error", "Update check failed", "error", "warning"],
        ["unknown", "", "installed", "hubot"],
    ])("renders the %s state", (updateStatus, description, key, iconId) => {
        const [row] = section({
            installLocation: "project",
            updateStatus,
            version: "0.2.10",
        }).getChildren();
        expect(row).toMatchObject({
            label: "AI tools",
            description,
            tooltip: "AI tools installed (project)",
            contextValue: `databricks.configuration.aitools.${key}`,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        });
        expect(row!.command).toBeUndefined();
        expect(icon(row!)).toBe(iconId);
    });

    it("falls back to 'Up to date' when the version is unknown", () => {
        expect(
            section({ installLocation: "global", updateStatus: "upToDate" }).getChildren()[0]!
                .description,
        ).toBe("Up to date");
    });

    it("lists Scope, Version and the Agents with how many are installed", () => {
        const { rows } = children(
            section({
                installLocation: "global",
                version: "0.2.10",
                agents: [
                    agent({ version: "0.2.10" }),
                    agent({ id: "goose", displayName: "Goose" }),
                ],
            }),
        );
        expect(rows.map((r) => [r.label, r.description])).toEqual([
            ["Scope", "global"],
            ["Version", "0.2.10"],
            ["Agents", "1 installed"],
        ]);
        expect(rows[2]!.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
    });

    it("omits Version and Agents when unknown", () => {
        expect(children(section({ installLocation: "global" })).rows.map((r) => r.label)).toEqual([
            "Scope",
        ]);
    });

    it("renders each agent's state", () => {
        const { agents } = children(
            section({
                installLocation: "project",
                agents: [
                    agent({ version: "0.2.10" }),
                    agent({
                        id: "codex",
                        displayName: "Codex CLI",
                        version: "0.2.10",
                        skillsOnly: true,
                    }),
                    agent({ id: "goose", displayName: "Goose" }),
                    agent({ id: "pi", displayName: "Pi", detected: false }),
                    agent({
                        id: "copilot",
                        displayName: "GitHub Copilot",
                        supportsProjectScope: false,
                    }),
                ],
            }),
        );
        expect(agents.map((a) => [a.label, a.description, a.contextValue, icon(a)])).toEqual([
            ["Claude Code", "0.2.10", "databricks.configuration.aitools.agent.installed", "check"],
            [
                "Codex CLI",
                "0.2.10 (skills only)",
                "databricks.configuration.aitools.agent.installed",
                "check",
            ],
            [
                "Goose",
                "Not installed",
                "databricks.configuration.aitools.agent.notInstalled",
                undefined,
            ],
            [
                "Pi",
                "Not detected",
                "databricks.configuration.aitools.agent.blocked",
                "circle-slash",
            ],
            [
                "GitHub Copilot",
                "Only supports global scope",
                "databricks.configuration.aitools.agent.blocked",
                "circle-slash",
            ],
        ]);
        expect(agents[2]!.command).toEqual({
            title: "Install AI tools for this agent",
            command: "databricks.aitools.installAgent",
            arguments: [{ id: "AITOOLS.agent.goose" }],
        });
        expect(agents.filter((a) => a.command !== undefined)).toHaveLength(1);
        expect(agents[3]!.tooltip).toBe("Pi was not detected on this machine.");
    });

    it("keeps a global-only agent installable in a global install", () => {
        const { agents } = children(
            section({
                installLocation: "global",
                agents: [
                    agent({
                        id: "copilot",
                        displayName: "GitHub Copilot",
                        supportsProjectScope: false,
                    }),
                ],
            }),
        );
        expect(agents[0]!.description).toBe("Not installed");
    });

    it("hides the Cursor agent in Cursor, and leaves it out of the count", () => {
        const state = {
            installLocation: "global" as const,
            agents: [agent({ id: "cursor", displayName: "Cursor", version: "0.2.10" }), agent({})],
        };
        const inCursor = children(section(state, true));
        expect(inCursor.agents.map((a) => a.label)).toEqual(["Claude Code"]);
        expect(inCursor.rows.find((r) => r.label === "Agents")!.description).toBe("0 installed");
        expect(children(section(state)).agents.map((a) => a.label)).toEqual([
            "Cursor",
            "Claude Code",
        ]);
    });

    it("returns nothing for another section's rows", () => {
        expect(
            section({ installLocation: "global" }).getChildren({ label: "Target", id: "target" }),
        ).toEqual([]);
        expect(section({}).getChildren({ label: "Target" })).toEqual([]);
    });

    it("goes in the Models & AI tools view, with a line of text until the tools are installed", () => {
        expect(section({}).view).toBe("modelsAndAiTools");
        expect(section({}).message()).toBe(
            "Get skills and plugins so your coding agents work effectively with Databricks.",
        );
        expect(section({ installLocation: "global" }).message()).toBeUndefined();
        // The retry row explains a failed check; the tools may be installed.
        expect(section({ detectError: true }).message()).toBeUndefined();
    });
});
