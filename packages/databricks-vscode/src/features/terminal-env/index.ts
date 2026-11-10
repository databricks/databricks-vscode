import type { Feature } from "../../kernel/feature";
import { applyTerminalEnvironment, terminalEnvironment } from "./terminalEnvironment";

/**
 * The integrated terminals' environment (INFRA-02), in window scope: set at
 * activation, cleared when the extension deactivates, since it isn't persistent.
 */
export const terminalEnv: Feature = {
    id: "terminal-env",

    register(ctx) {
        applyTerminalEnvironment(
            ctx.kernel.terminalEnvironment,
            terminalEnvironment(ctx.kernel.extension),
        );
    },
};
