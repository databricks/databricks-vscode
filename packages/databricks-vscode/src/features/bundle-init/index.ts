import { AI_TOOLS_INSTALLED } from "../../kernel/aitools/commands";
import { CHOOSE_PROFILE, CONNECTED_PROFILE } from "../../kernel/connection/commands";
import type { Feature } from "../../kernel/feature";
import { BundleInitWizard } from "./BundleInitWizard";
import { BUNDLE_INIT, BUNDLE_INIT_EVENTS } from "./telemetry";

export const INIT_NEW_PROJECT = "databricks.bundle.initNewProject";

/**
 * The new-project wizard (BNDL-01), in window scope: it works with and
 * without a folder, signed in or not.
 */
export const bundleInit: Feature = {
    id: "bundle-init",
    telemetryEvents: BUNDLE_INIT_EVENTS,
    session: {
        [INIT_NEW_PROJECT]: {
            unavailable:
                "A project created in a session window takes minutes to show in its folders, so it can't be opened here right away.",
            instead:
                "Create the project in a local window, or run `databricks bundle init` in this window's terminal and open its folder once it shows.",
        },
    },

    register(ctx) {
        ctx.commands.register(INIT_NEW_PROJECT, async () => {
            const record = ctx.telemetry.start(BUNDLE_INIT);
            const hasAiTools = (await ctx.commands.execute(AI_TOOLS_INSTALLED, undefined)) ?? false;
            let success = false;
            try {
                const wizard = new BundleInitWizard({
                    kernel: ctx.kernel,
                    log: ctx.log,
                    chooseProfile: () => ctx.commands.execute(CHOOSE_PROFILE, undefined),
                    connectedProfile: () => ctx.commands.execute(CONNECTED_PROFILE, undefined),
                });
                success = await wizard.run();
            } finally {
                record({ success, hasAiTools });
            }
        });
    },
};
