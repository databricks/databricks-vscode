import type { AiToolsScope } from "../../kernel/cli";
import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/** Where an install started: the first-run prompt, or the configuration view and the palette. */
export type AiToolsInstallSource = "initModal" | "sidePane";
/** Where the Cursor plugin prompt started: an install, or the plugin button on the AI tools row. */
export type AiToolsCursorPluginSource = AiToolsInstallSource | "pluginButton";
/** `possible-success`: the flow finished, but its outcome isn't observable (the Cursor plugin alone). */
export type AiToolsInstallResult = "success" | "error" | "possible-success";

/** The old events, with the old names and comments. */
export const AITOOLS_INSTALL = telemetryEvent<
    {
        result: AiToolsInstallResult;
        scope: AiToolsScope;
        source?: AiToolsInstallSource;
        agents?: string[];
        cursorPlugin?: boolean;
        globalErrorCategory?: string;
        agentErrors?: Record<string, string>;
    } & DurationMeasurement
>("aitoolsInstall", "Install Databricks AI tools", {
    result: {
        comment:
            "The install outcome: 'success' (ran and completed), 'error' (ran and failed), or 'possible-success' (the user completed the flow but the install is not observable by the extension, e.g. the Cursor-plugin-only case). Kept separate so 'possible-success' doesn't inflate the confirmed 'success' count.",
    },
    scope: { comment: "The install scope (project or global)" },
    source: {
        comment:
            "Where the install was triggered from: 'initModal' (first-load prompt) or 'sidePane' (manual click in the configuration view)",
    },
    agents: {
        comment:
            'The coding agents whose skills were installed via the CLI (the closed set of agent ids, e.g. ["claude-code","cursor"]). Excludes the Cursor plugin, which is tracked separately by cursorPlugin. Undefined when no explicit selection was made (the CLI acts on every detected agent).',
    },
    cursorPlugin: {
        comment:
            "In Cursor, whether the Databricks marketplace plugin (a superset of the Cursor skills) was installed as part of this flow, rather than the cursor skills via the CLI",
    },
    globalErrorCategory: {
        comment:
            "The CLI's classification of a top-level install failure that has no per-agent entry (e.g. a skills-group install). A closed category token (e.g. SKILL_NOT_FOUND, PLUGIN_INSTALL_FAILED), never the CLI's free-form error message. Omitted when there was no top-level failure.",
    },
    agentErrors: {
        comment:
            "Per-agent install errors as a map of agent id to its categorical error, for each requested agent that did not install (failed or skipped). Categories are the CLI's closed set, never the free-form per-agent message. Omitted when every requested agent installed.",
    },
    ...durationComment,
});

export const AITOOLS_UPDATE = telemetryEvent<
    { success: boolean; scope: AiToolsScope } & DurationMeasurement
>("aitoolsUpdate", "Update Databricks AI tools", {
    success: { comment: "true if the update succeeded, false otherwise" },
    scope: { comment: "The update scope (project or global)" },
    ...durationComment,
});

export const AITOOLS_UNINSTALL = telemetryEvent<
    { success: boolean; scope: AiToolsScope } & DurationMeasurement
>("aitoolsUninstall", "Uninstall Databricks AI tools", {
    success: { comment: "true if the uninstall succeeded, false otherwise" },
    scope: { comment: "The uninstall scope (project or global)" },
    ...durationComment,
});

export const AITOOLS_CURSOR_PLUGIN_PROMPT = telemetryEvent<{
    success: boolean;
    source?: AiToolsCursorPluginSource;
}>(
    "aitoolsCursorPluginPrompt",
    "Prompted the user to install the Databricks plugin from the Cursor marketplace (opened the install modal). We can only observe that we opened the modal, not whether the user actually added the plugin.",
    {
        success: {
            comment: "true if the marketplace modal was opened, false if opening it failed",
        },
        source: {
            comment:
                "Where the plugin prompt was triggered from: 'initModal' (first-load install prompt) or 'sidePane' (install triggered from the configuration view), both via the install flow, or 'pluginButton' (the standalone add-plugin button on the AI tools row)",
        },
    },
);

export const AI_TOOLS_EVENTS = [
    AITOOLS_INSTALL,
    AITOOLS_UPDATE,
    AITOOLS_UNINSTALL,
    AITOOLS_CURSOR_PLUGIN_PROMPT,
];
