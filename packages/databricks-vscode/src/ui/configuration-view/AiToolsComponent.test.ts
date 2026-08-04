/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {ThemeIcon} from "vscode";
import {
    AiToolsAgentStatus,
    AiToolsInstallLocation,
    AiToolsModel,
    AiToolsUpdateStatus,
} from "../../aitools/AiToolsModel";
import {resolveProviderResult} from "../../test/utils";
import {AiToolsComponent} from "./AiToolsComponent";
import {HostUtils} from "../../utils";

function createModel(
    installLocation: AiToolsInstallLocation,
    updateStatus: AiToolsUpdateStatus,
    version?: string,
    detectError?: boolean,
    agents: AiToolsAgentStatus[] = []
): AiToolsModel {
    return {
        state: {installLocation, updateStatus, version, detectError, agents},
        onDidChange: () => ({dispose() {}}),
    } as unknown as AiToolsModel;
}

async function getRoot(model: AiToolsModel) {
    const component = new AiToolsComponent(model);
    const items = await resolveProviderResult(component.getChildren());
    return items ?? [];
}

async function getChildrenOf(
    model: AiToolsModel,
    parent: {label?: string; id?: string}
) {
    const component = new AiToolsComponent(model);
    const items = await resolveProviderResult(component.getChildren(parent));
    return items ?? [];
}

function agent(
    id: string,
    displayName: string,
    version?: string
): AiToolsAgentStatus {
    return {
        id,
        displayName,
        type: version !== undefined ? "plugin" : "skills-only",
        detected: version !== undefined,
        version,
    };
}

describe(__filename, () => {
    it("renders a setup prompt when not installed", async () => {
        const items = await getRoot(createModel(undefined, "unknown"));
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
            createModel(undefined, "unknown", undefined, true)
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
            createModel("project", "upToDate", "0.2.9", true)
        );
        const [row] = items;
        assert.strictEqual(row.label, "AI tools");
        assert.ok(String(row.tooltip).includes("project"));
    });

    it("renders the installed version in the subtext for a project install", async () => {
        const items = await getRoot(
            createModel("project", "upToDate", "0.2.9")
        );
        assert.strictEqual(items.length, 1);
        const [row] = items;
        assert.strictEqual(row.label, "AI tools");
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.upToDate"
        );
        assert.ok(String(row.tooltip).includes("project"));
        assert.ok(String(row.description).includes("v0.2.9"));
    });

    it("falls back to 'Up to date' when the version is unknown", async () => {
        const items = await getRoot(createModel("project", "upToDate"));
        const [row] = items;
        assert.ok(String(row.description).includes("Up to date"));
        // Stable states use the robot icon.
        assert.strictEqual((row.iconPath as ThemeIcon).id, "hubot");
    });

    it("renders an update-available row without a click command", async () => {
        const items = await getRoot(createModel("global", "updateAvailable"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.updateAvailable"
        );
        assert.ok(String(row.tooltip).includes("global"));
        assert.ok(String(row.description).includes("Update available"));
        assert.strictEqual((row.iconPath as ThemeIcon).id, "hubot");
        // Updates apply automatically; the row is not clickable.
        assert.strictEqual(row.command, undefined);
    });

    it("renders an updating spinner while auto-updating", async () => {
        const items = await getRoot(createModel("project", "updating"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.updating"
        );
        assert.ok(String(row.description).includes("Updating"));
        assert.strictEqual((row.iconPath as ThemeIcon).id, "sync~spin");
    });

    it("does not attach a click command to an up-to-date row", async () => {
        const items = await getRoot(createModel("project", "upToDate"));
        const [row] = items;
        assert.strictEqual(row.command, undefined);
    });

    it("renders a checking spinner while checking for updates", async () => {
        const items = await getRoot(createModel("project", "checking"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.checking"
        );
        assert.strictEqual((row.iconPath as ThemeIcon).id, "sync~spin");
    });

    it("uses the generic installed context value for unknown status", async () => {
        const items = await getRoot(createModel("project", "unknown"));
        const [row] = items;
        assert.strictEqual(
            row.contextValue,
            "databricks.configuration.aitools.installed"
        );
    });

    it("returns nothing for a non-root parent", async () => {
        const component = new AiToolsComponent(
            createModel("project", "upToDate")
        );
        const children = await resolveProviderResult(
            component.getChildren({label: "AI tools", id: "unknown"})
        );
        assert.deepStrictEqual(children, []);
    });

    // The data provider fans getChildren(parent) out to every component and
    // flattens the results, so a foreign parent (another component's node being
    // expanded) must never make us re-emit the AITOOLS root row. Doing so would
    // register a second element with id "AITOOLS" and throw.
    it("does not re-emit the root row for a foreign parent when not installed", async () => {
        const component = new AiToolsComponent(
            createModel(undefined, "unknown")
        );
        const children = await resolveProviderResult(
            component.getChildren({label: "Some other node", id: "cluster"})
        );
        assert.deepStrictEqual(children, []);
    });

    it("does not re-emit the root row for a foreign parent when detection errored", async () => {
        const component = new AiToolsComponent(
            createModel(undefined, "unknown", undefined, true)
        );
        const children = await resolveProviderResult(
            component.getChildren({label: "Some other node", id: "cluster"})
        );
        assert.deepStrictEqual(children, []);
    });

    describe("agents", () => {
        it("renders an Agents node summarizing how many are installed", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                [
                    agent("claude", "Claude Code", "1.2.0"),
                    agent("cursor", "Cursor"),
                    agent("copilot", "GitHub Copilot", "0.5.0"),
                ]
            );
            const children = await getChildrenOf(model, {
                label: "AI tools",
                id: "AITOOLS",
            });
            const agentsNode = children.find((c) => c.id === "AITOOLS.agents");
            assert.ok(agentsNode, "expected an Agents node");
            assert.strictEqual(agentsNode.label, "Agents");
            // Only the two agents with a version count as installed.
            assert.strictEqual(agentsNode.description, "2 installed");
        });

        it("reports 0 installed when no agents have a version", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                [agent("cursor", "Cursor")]
            );
            const children = await getChildrenOf(model, {
                label: "AI tools",
                id: "AITOOLS",
            });
            const agentsNode = children.find((c) => c.id === "AITOOLS.agents");
            assert.strictEqual(agentsNode?.description, "0 installed");
        });

        it("still renders the Agents node when there are no agents", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                []
            );
            const children = await getChildrenOf(model, {
                label: "AI tools",
                id: "AITOOLS",
            });
            const agentsNode = children.find((c) => c.id === "AITOOLS.agents");
            assert.ok(agentsNode, "expected an Agents node");
            assert.strictEqual(agentsNode.description, "0 installed");
        });

        it("lists each agent with its version under the Agents node", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                [
                    agent("claude", "Claude Code", "1.2.0"),
                    agent("cursor", "Cursor"),
                ]
            );
            const rows = await getChildrenOf(model, {
                label: "Agents",
                id: "AITOOLS.agents",
            });
            assert.strictEqual(rows.length, 2);

            const [claude, cursor] = rows;
            assert.strictEqual(claude.label, "Claude Code");
            assert.strictEqual(claude.id, "AITOOLS.agent.claude");
            assert.strictEqual(claude.description, "1.2.0");

            // Agents without a version render as "Not installed".
            assert.strictEqual(cursor.label, "Cursor");
            assert.strictEqual(cursor.id, "AITOOLS.agent.cursor");
            assert.strictEqual(cursor.description, "Not installed");
        });

        it("returns no agent rows when the agents list is empty", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                []
            );
            const rows = await getChildrenOf(model, {
                label: "Agents",
                id: "AITOOLS.agents",
            });
            assert.deepStrictEqual(rows, []);
        });

        it("marks installed agents with a green check and no install affordance", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                [agent("claude", "Claude Code", "1.2.0")]
            );
            const [row] = await getChildrenOf(model, {
                label: "Agents",
                id: "AITOOLS.agents",
            });
            assert.strictEqual((row.iconPath as ThemeIcon).id, "check");
            assert.strictEqual(
                row.contextValue,
                "databricks.configuration.aitools.agent.installed"
            );
            // Installed agents are not clickable.
            assert.strictEqual(row.command, undefined);
        });

        it("gives uninstalled agents the install context value used by the inline button", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                [agent("codex", "Codex CLI")]
            );
            const [row] = await getChildrenOf(model, {
                label: "Agents",
                id: "AITOOLS.agents",
            });
            assert.strictEqual(row.iconPath, undefined);
            assert.strictEqual(
                row.contextValue,
                "databricks.configuration.aitools.agent.notInstalled"
            );
        });

        it("makes an uninstalled agent row clickable to install it", async () => {
            const model = createModel(
                "project",
                "upToDate",
                "0.2.9",
                undefined,
                [agent("codex", "Codex CLI")]
            );
            const [row] = await getChildrenOf(model, {
                label: "Agents",
                id: "AITOOLS.agents",
            });
            assert.strictEqual(
                row.command?.command,
                "databricks.aitools.installAgent"
            );
            // The node id is passed through so a click matches the inline
            // button, and the command handler can recover the agent id.
            assert.deepStrictEqual(row.command?.arguments, [
                {id: "AITOOLS.agent.codex"},
            ]);
        });

        describe("in Cursor", () => {
            let originalIsCursor: typeof HostUtils.isCursor;

            beforeEach(() => {
                originalIsCursor = HostUtils.isCursor;
                (HostUtils as any).isCursor = () => true;
            });

            afterEach(() => {
                (HostUtils as any).isCursor = originalIsCursor;
            });

            it("hides the Cursor agent row (it is managed via the marketplace plugin)", async () => {
                const model = createModel(
                    "project",
                    "upToDate",
                    "0.2.9",
                    undefined,
                    [
                        agent("claude", "Claude Code", "1.2.0"),
                        agent("cursor", "Cursor", "0.3.0"),
                    ]
                );
                const rows = await getChildrenOf(model, {
                    label: "Agents",
                    id: "AITOOLS.agents",
                });
                assert.deepStrictEqual(
                    rows.map((r) => r.id),
                    ["AITOOLS.agent.claude"]
                );
            });

            it("excludes the hidden Cursor agent from the installed count", async () => {
                const model = createModel(
                    "project",
                    "upToDate",
                    "0.2.9",
                    undefined,
                    [
                        agent("claude", "Claude Code", "1.2.0"),
                        // Installed, but hidden in Cursor -> must not be counted.
                        agent("cursor", "Cursor", "0.3.0"),
                    ]
                );
                const children = await getChildrenOf(model, {
                    label: "AI tools",
                    id: "AITOOLS",
                });
                const agentsNode = children.find(
                    (c) => c.id === "AITOOLS.agents"
                );
                assert.strictEqual(agentsNode?.description, "1 installed");
            });
        });
    });
});
