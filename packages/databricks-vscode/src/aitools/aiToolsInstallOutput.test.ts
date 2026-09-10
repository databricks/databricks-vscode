/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {AiToolsInstallOutput} from "../cli/CliWrapper";
import {
    describeAiToolsInstallFailure,
    summarizeAiToolsInstallErrors,
} from "./aiToolsInstallOutput";

const success: AiToolsInstallOutput = {
    scope: "global",
    agents: [{name: "claude-code", delivery: "plugin", status: "installed"}],
};
const perAgentSkip: AiToolsInstallOutput = {
    scope: "project",
    agents: [
        {
            name: "codex",
            delivery: "skip",
            status: "skipped",
            error_category: "UNSUPPORTED_SCOPE",
            message: "Codex CLI is user-only; project scope is not supported",
        },
    ],
};
const topLevelError: AiToolsInstallOutput = {
    scope: "global",
    agents: [],
    error: 'skill "__nope__" not found',
    error_category: "SKILL_NOT_FOUND",
};

describe(__filename, () => {
    describe("summarizeAiToolsInstallErrors", () => {
        it("returns nothing for undefined", () => {
            assert.deepStrictEqual(
                summarizeAiToolsInstallErrors(undefined),
                {}
            );
        });

        it("returns nothing on a clean success", () => {
            assert.deepStrictEqual(summarizeAiToolsInstallErrors(success), {});
        });

        it("maps each non-installed agent to its category, without the message", () => {
            assert.deepStrictEqual(
                summarizeAiToolsInstallErrors(perAgentSkip),
                {agentErrors: {codex: "UNSUPPORTED_SCOPE"}}
            );
        });

        it("maps several failed agents each to its own category", () => {
            assert.deepStrictEqual(
                summarizeAiToolsInstallErrors({
                    scope: "global",
                    agents: [
                        {
                            name: "copilot",
                            delivery: "plugin",
                            status: "failed",
                            error_category: "PLUGIN_INSTALL_FAILED",
                        },
                        {
                            name: "codex",
                            delivery: "plugin",
                            status: "failed",
                            error_category: "PLUGIN_INSTALL_FAILED",
                        },
                        {
                            name: "goose",
                            delivery: "skip",
                            status: "skipped",
                            error_category: "UNSUPPORTED_SCOPE",
                        },
                    ],
                }),
                {
                    agentErrors: {
                        copilot: "PLUGIN_INSTALL_FAILED",
                        codex: "PLUGIN_INSTALL_FAILED",
                        goose: "UNSUPPORTED_SCOPE",
                    },
                }
            );
        });

        it("reports a top-level category and no agent map", () => {
            assert.deepStrictEqual(
                summarizeAiToolsInstallErrors(topLevelError),
                {globalErrorCategory: "SKILL_NOT_FOUND"}
            );
        });

        it("reports both a top-level and per-agent errors together", () => {
            assert.deepStrictEqual(
                summarizeAiToolsInstallErrors({
                    scope: "global",
                    agents: [
                        {
                            name: "codex",
                            delivery: "skip",
                            status: "skipped",
                            error_category: "UNSUPPORTED_SCOPE",
                        },
                    ],
                    error: "boom",
                    error_category: "UNCATEGORIZED",
                }),
                {
                    globalErrorCategory: "UNCATEGORIZED",
                    agentErrors: {codex: "UNSUPPORTED_SCOPE"},
                }
            );
        });
    });

    describe("describeAiToolsInstallFailure", () => {
        it("returns undefined for undefined", () => {
            assert.strictEqual(
                describeAiToolsInstallFailure(undefined),
                undefined
            );
        });

        it("returns undefined when nothing actually failed", () => {
            assert.strictEqual(
                describeAiToolsInstallFailure(success),
                undefined
            );
        });

        it("folds a per-agent message in", () => {
            assert.strictEqual(
                describeAiToolsInstallFailure(perAgentSkip),
                "codex: Codex CLI is user-only; project scope is not supported"
            );
        });

        it("uses the top-level error", () => {
            assert.strictEqual(
                describeAiToolsInstallFailure(topLevelError),
                'skill "__nope__" not found'
            );
        });

        it("uses fallback for per-agent errors when there is no message", () => {
            assert.strictEqual(
                describeAiToolsInstallFailure({
                    scope: "global",
                    agents: [
                        {
                            name: "copilot",
                            delivery: "plugin",
                            status: "failed",
                            error_category: "PLUGIN_INSTALL_FAILED",
                        },
                        {name: "codex", delivery: "skip", status: "skipped"},
                    ],
                }),
                "copilot: failed to install\ncodex: failed to install"
            );
        });

        it("joins the top-level error and per-agent messages", () => {
            assert.strictEqual(
                describeAiToolsInstallFailure({
                    scope: "global",
                    agents: [
                        {
                            name: "codex",
                            delivery: "skip",
                            status: "skipped",
                            message: "user-only",
                        },
                    ],
                    error: "boom",
                }),
                "boom\ncodex: user-only"
            );
        });
    });
});
