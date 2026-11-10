import { describe, expect, it } from "vitest";
import {
    agentInstallBlockReason,
    agentStatusesOf,
    describeInstallFailure,
    summarizeInstallErrors,
    updateStatusOf,
    type AiToolsAgentStatus,
} from "./model";

const agent = (overrides: Partial<AiToolsAgentStatus> = {}): AiToolsAgentStatus => ({
    displayName: "Claude Code",
    id: "claude-code",
    type: "plugin",
    detected: true,
    supportsProjectScope: true,
    ...overrides,
});

describe("agentInstallBlockReason", () => {
    it("blocks an undetected agent regardless of scope", () => {
        expect(agentInstallBlockReason(agent({ detected: false }), "global")).toBe("notDetected");
        expect(
            agentInstallBlockReason(
                agent({ detected: false, supportsProjectScope: false }),
                "project",
            ),
        ).toBe("notDetected");
    });

    it("blocks a detected, scope-unsupported agent at project scope only", () => {
        expect(agentInstallBlockReason(agent({ supportsProjectScope: false }), "project")).toBe(
            "scopeUnsupported",
        );
        expect(
            agentInstallBlockReason(agent({ supportsProjectScope: false }), "global"),
        ).toBeUndefined();
    });

    it("does not block a detected, scope-supported agent", () => {
        expect(agentInstallBlockReason(agent(), "project")).toBeUndefined();
    });
});

describe("updateStatusOf", () => {
    const skill = (latest: string, installed: Record<string, string>) => ({
        name: "s",
        latest_version: latest,
        installed,
    });

    it("is up to date when every installed skill is at its latest version", () => {
        expect(updateStatusOf([skill("1.0", { project: "1.0" })], "project")).toBe("upToDate");
    });

    it("has an update when an installed skill is behind", () => {
        expect(
            updateStatusOf(
                [skill("1.0", { project: "1.0" }), skill("2.0", { project: "1.0" })],
                "project",
            ),
        ).toBe("updateAvailable");
    });

    it("ignores skills not installed in the scope", () => {
        expect(updateStatusOf([skill("2.0", {}), skill("2.0", { global: "1.0" })], "project")).toBe(
            "upToDate",
        );
    });
});

describe("agentStatusesOf", () => {
    it("maps the CLI's agents for the scope", () => {
        const statuses = agentStatusesOf(
            [
                {
                    name: "claude-code",
                    display_name: "Claude Code",
                    managed: true,
                    detected: true,
                    supports_project_scope: true,
                    installed: { project: { version: "0.2.10", delivery: "skills" } },
                },
                {
                    name: "goose",
                    display_name: "Goose",
                    managed: false,
                    detected: false,
                    installed: { global: { version: "0.2.9" } },
                },
            ],
            "project",
        );
        expect(statuses).toEqual([
            {
                displayName: "Claude Code",
                id: "claude-code",
                type: "plugin",
                detected: true,
                supportsProjectScope: true,
                version: "0.2.10",
                skillsOnly: true,
            },
            // An older CLI omits supports_project_scope: read as supported.
            {
                displayName: "Goose",
                id: "goose",
                type: "skills-only",
                detected: false,
                supportsProjectScope: true,
                skillsOnly: false,
            },
        ]);
    });
});

describe("summarizeInstallErrors", () => {
    it("returns nothing without a result, or for a clean success", () => {
        expect(summarizeInstallErrors(undefined)).toEqual({});
        expect(
            summarizeInstallErrors({ agents: [{ name: "goose", status: "installed" }] }),
        ).toEqual({});
    });

    it("maps each agent that didn't install to its category, without the message", () => {
        expect(
            summarizeInstallErrors({
                agents: [
                    {
                        name: "copilot",
                        status: "skipped",
                        error_category: "UNSUPPORTED_SCOPE",
                        message: "user-only",
                    },
                    {
                        name: "codex",
                        status: "failed",
                        error_category: "PLUGIN_INSTALL_FAILED",
                        message: "codex: not found",
                    },
                    { name: "goose", status: "installed" },
                ],
            }),
        ).toEqual({
            agentErrors: { copilot: "UNSUPPORTED_SCOPE", codex: "PLUGIN_INSTALL_FAILED" },
        });
    });

    it("reports a top-level category, together with the agents'", () => {
        expect(
            summarizeInstallErrors({ agents: [], error: "x", error_category: "SKILL_NOT_FOUND" }),
        ).toEqual({ globalErrorCategory: "SKILL_NOT_FOUND" });
        expect(
            summarizeInstallErrors({
                agents: [{ name: "a", status: "failed", error_category: "E" }],
                error_category: "G",
            }),
        ).toEqual({ globalErrorCategory: "G", agentErrors: { a: "E" } });
    });
});

describe("describeInstallFailure", () => {
    it("returns nothing without a failure", () => {
        expect(describeInstallFailure(undefined)).toBeUndefined();
        expect(
            describeInstallFailure({ agents: [{ name: "goose", status: "installed" }] }),
        ).toBeUndefined();
    });

    it("joins the top-level error and each agent's message", () => {
        expect(
            describeInstallFailure({
                error: "skills group failed",
                agents: [
                    {
                        name: "copilot",
                        status: "skipped",
                        message: "GitHub Copilot is user-only; project scope is not supported",
                    },
                    { name: "codex", status: "failed" },
                ],
            }),
        ).toBe(
            "skills group failed\ncopilot: GitHub Copilot is user-only; project scope is not supported\ncodex: failed to install",
        );
    });
});
