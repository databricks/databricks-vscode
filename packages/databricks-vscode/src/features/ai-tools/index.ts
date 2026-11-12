import fs from "node:fs/promises";
import os from "node:os";
import { commands, env, workspace } from "vscode";
import { AI_TOOLS_INSTALLED } from "../../kernel/aitools/commands";
import { COPILOT_CHAT } from "../../kernel/extensionDependencies";
import type { Feature, FeatureContext } from "../../kernel/feature";
import { contextKey } from "../../platform/contextKeys";
import { Emitter } from "../../platform/event";
import { when } from "../../platform/reactive";
import { AiToolsCommands } from "./AiToolsCommands";
import { AiToolsSection, INSTALL, INSTALL_AGENT, RELOAD } from "./AiToolsSection";
import { AiToolsService, CURSOR_PLUGIN_ID, HIDE_INSTALL_PROMPT } from "./AiToolsService";
import {
    copilotShimDir,
    getCopilotCliStatus,
    probeCopilotCli,
    shimOnTerminalPath,
    withShimOnPath,
} from "./copilotShim";
import { AI_TOOLS_EVENTS } from "./telemetry";

const CHECK_FOR_UPDATES = "databricks.aitools.checkForUpdates";
const UPDATE = "databricks.aitools.update";
const UNINSTALL = "databricks.aitools.uninstall";
const ADD_CURSOR_PLUGIN = "databricks.aitools.addCursorPlugin";
export const SHOW_INSTALL_PROMPT = "databricks.aitools.showInstallPrompt";

/** AI tools are installed: the palette offers Update and Uninstall instead of Install. */
export const AITOOLS_INSTALLED = contextKey<boolean>("databricks.context.aitools.installed");
/** Running in Cursor: the AI tools row gets the "Add Databricks plugin to Cursor" button. */
export const AITOOLS_SHOW_CURSOR_PLUGIN = contextKey<boolean>(
    "databricks.context.aitools.showCursorPlugin",
);
/** "Don't show again" was chosen on the first-run prompt; the palette offers to undo it. */
export const AITOOLS_INSTALL_PROMPT_HIDDEN = contextKey<boolean>(
    "databricks.context.aitools.installPromptHidden",
);

/** Each registration's flows, for its `start`. */
const flows = new WeakMap<FeatureContext, AiToolsCommands>();

/** Why a session window has no AI tools (`capabilities.aiTools`). */
const AI_TOOLS_IN_A_SESSION = {
    unavailable:
        "In a session window the AI tools would install on the Databricks compute, whose home folder a serverless session discards.",
    instead: "Install them from a local window.",
} as const;

/**
 * Databricks AI tools (AI-01 to AI-03), in window scope: global installs
 * work without a folder. The AI tools rows show in the Models & AI tools
 * view in every window. Activation runs the first-run check, except where
 * the host has no AI tools (a session window).
 */
export const aiTools: Feature = {
    id: "ai-tools",
    contextKeys: [AITOOLS_INSTALLED, AITOOLS_SHOW_CURSOR_PLUGIN, AITOOLS_INSTALL_PROMPT_HIDDEN],
    telemetryEvents: AI_TOOLS_EVENTS,
    session: Object.fromEntries(
        [
            INSTALL,
            CHECK_FOR_UPDATES,
            RELOAD,
            UPDATE,
            UNINSTALL,
            ADD_CURSOR_PLUGIN,
            INSTALL_AGENT,
            SHOW_INSTALL_PROMPT,
        ].map((id) => [id, AI_TOOLS_IN_A_SESSION]),
    ),

    register(ctx) {
        const { kernel } = ctx;
        const isCursor = env.uriScheme === "cursor";
        // The PATH an integrated terminal gets, so `copilot` can be VS Code's shim.
        const shimDir = copilotShimDir(env.appRoot, process.execPath);
        const aiToolsEnv = (): Record<string, string> => {
            const child = kernel.childEnv({ connection: null, cli: true });
            const onPath = shimOnTerminalPath(
                kernel.settings,
                kernel.extensionDependencies.available(COPILOT_CHAT),
            );
            return onPath ? withShimOnPath(child, shimDir) : child;
        };
        const service = new AiToolsService({
            cli: kernel.cli,
            env: aiToolsEnv,
            copilotCliStatus: () => {
                const childEnv = aiToolsEnv();
                return getCopilotCliStatus({
                    env: childEnv,
                    probe: (binary) => probeCopilotCli(kernel.processes, binary, childEnv),
                });
            },
            state: kernel.state,
            projectFolder: () =>
                kernel.project.active.value?.root ?? workspace.workspaceFolders?.[0]?.uri.fsPath,
            homeDir: os.homedir(),
            readFile: (p) => fs.readFile(p),
            isCursor,
            openCursorPlugin: () =>
                commands.executeCommand("workbench.action.openMarketplaceEditor", {
                    pluginId: CURSOR_PLUGIN_ID,
                    openInstallModal: true,
                    skipTracking: true,
                }),
            telemetry: ctx.telemetry,
            log: ctx.log,
        });
        const ui = new AiToolsCommands(
            service,
            isCursor,
            () => kernel.showLog(),
            ctx.log,
            (e) => ctx.commands.showError(e),
        );
        const changed = new Emitter<void>();
        const syncKeys = () => {
            void kernel.contextKeys.set(AITOOLS_INSTALLED, service.isInstalled);
            void kernel.contextKeys.set(
                AITOOLS_INSTALL_PROMPT_HIDDEN,
                !service.shouldPromptInstall,
            );
        };
        ctx.subscriptions.push(
            service,
            ui,
            changed,
            service.state.onDidChange(() => {
                syncKeys();
                changed.fire();
            }),
            kernel.state.onDidChange(HIDE_INSTALL_PROMPT)(syncKeys),
            // Project-scope installs live in the project folder.
            kernel.project.active.onDidChange(() => void service.refresh()),
        );
        void kernel.contextKeys.set(AITOOLS_SHOW_CURSOR_PLUGIN, isCursor);
        syncKeys();

        ctx.subscriptions.push(
            ctx.sections.add(
                new AiToolsSection(() => service.state.value, isCursor, changed.event),
            ),
        );

        ctx.commands.register(INSTALL, (source?: unknown) =>
            ui.install(source === "initModal" ? "initModal" : "sidePane"),
        );
        ctx.commands.register(CHECK_FOR_UPDATES, () => service.checkForUpdates());
        ctx.commands.register(RELOAD, () => ui.initialize());
        ctx.commands.register(UPDATE, () => ui.update());
        ctx.commands.register(UNINSTALL, () => ui.uninstall());
        ctx.commands.register(ADD_CURSOR_PLUGIN, () => service.addCursorPlugin("pluginButton"));
        ctx.commands.register(INSTALL_AGENT, (node?: { id?: string }) => ui.installAgent(node));
        ctx.commands.register(SHOW_INSTALL_PROMPT, () => ui.showPromptAgain());
        ctx.commands.registerInternal(AI_TOOLS_INSTALLED, () => service.isInstalled);

        flows.set(ctx, ui);
    },

    async start(ctx) {
        // Where the host has no AI tools, they are hidden: there is nothing to set up.
        if (ctx.kernel.capabilities.aiTools) {
            // A project-scope install is in the project's folder, which is known once detection ends.
            await when(ctx.kernel.project.initialized, (initialized) => initialized);
            await flows.get(ctx)?.initialize();
        }
    },
};
