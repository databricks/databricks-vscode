import fs from "node:fs";
import { window } from "vscode";
import type { Feature, FeatureContext } from "../../kernel/feature";
import { OPEN_QUICKSTART, openQuickstart, showMarkdownPreview } from "./commands";
import { chooseFirstRunSurface } from "./firstRun";
import { LAST_INSTALLED_VERSION } from "./state";

/** The Quickstart walkthrough and What's New. Window scope. */
export const onboarding: Feature = {
    id: "onboarding",
    session: {
        [OPEN_QUICKSTART]: {
            unavailable:
                "The Quickstart walks through setting up a local window, and the SSH tunnel set this one up.",
            instead: "Open the Quickstart in a local window.",
        },
    },

    register(ctx) {
        ctx.commands.register(OPEN_QUICKSTART, openQuickstart);
    },

    async start(ctx) {
        // The tunnel set a session window up, so the walkthrough's steps don't apply.
        // Nor is the first-run state the session's: it is the laptop's, shared with
        // its local windows, which may run another version.
        if (ctx.kernel.capabilities.identity === "profiles") {
            await showFirstRunSurface(ctx);
        }
    },
};

async function showFirstRunSurface(ctx: FeatureContext) {
    const { extension, state } = ctx.kernel;
    const surface = chooseFirstRunSurface({
        previousVersion: state.get(LAST_INSTALLED_VERSION),
        currentVersion: extension.version,
        hasNotes: (notes) => fs.existsSync(extension.asAbsolutePath(notes)),
    });
    await state.set(LAST_INSTALLED_VERSION, extension.version);

    switch (surface.kind) {
        case "whatsNew":
            await whenFocused(ctx, () =>
                showMarkdownPreview(extension.asAbsolutePath(surface.notes)),
            );
            return;
        case "none":
            return;
    }
}

/** A preview opened in an unfocused window would go unnoticed; wait for focus. */
async function whenFocused(ctx: FeatureContext, show: () => Promise<void>) {
    if (window.state.focused) {
        return show();
    }
    const listener = window.onDidChangeWindowState((e) => {
        if (!e.focused) {
            return;
        }
        listener.dispose();
        show().catch((err: unknown) => ctx.log.error("Failed to open the first-run preview", err));
    });
    ctx.subscriptions.push(listener);
}
