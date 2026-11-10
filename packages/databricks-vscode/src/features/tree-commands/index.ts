import type { Feature } from "../../kernel/feature";
import {
    COPY,
    copyToClipboard,
    GO_TO_DEFINITION,
    goToDefinition,
    OPEN_EXTERNAL,
    openExternal,
    type TreeCommandTarget,
} from "../../platform/ui/treeCommands";
import { OPEN_RESOURCE_EXTERNALLY, TREE_COMMAND_EVENTS } from "./telemetry";

/**
 * The row actions every view shares (`platform/ui/treeCommands.ts`): open a
 * link, copy, go to definition. Window scope.
 */
export const treeCommands: Feature = {
    id: "tree-commands",
    telemetryEvents: TREE_COMMAND_EVENTS,
    // VS Code opens links and fills the clipboard on the user's machine.
    session: { [OPEN_EXTERNAL]: "same", [COPY]: "same", [GO_TO_DEFINITION]: "same" },

    register(ctx) {
        ctx.commands.register(OPEN_EXTERNAL, (value?: TreeCommandTarget) =>
            openExternal(value, (type) => ctx.telemetry.record(OPEN_RESOURCE_EXTERNALLY, { type })),
        );
        ctx.commands.register(COPY, (value?: TreeCommandTarget) => copyToClipboard(value));
        ctx.commands.register(GO_TO_DEFINITION, (value?: TreeCommandTarget) =>
            goToDefinition(value),
        );
    },
};
