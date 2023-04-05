import {commands} from "vscode";
import {recordEvent, Events} from "../telemetry";

/**
 * Wrapper function for commands.registerCommand adding instrumentation.
 *
 * The arguments to this function should be exactly the same as would be passed to
 * commands.registerCommand, and the return value is also the same.
 */
export function registerCommand(
    command: string,
    callback: (...args: any[]) => any,
    thisArg?: any
) {
    return commands.registerCommand(
        command,
        (...args) => {
            const start = performance.now();
            let success = true;
            try {
                return callback.call(thisArg, ...args);
            } catch (e: any) {
                success = false;
                throw e;
            } finally {
                const end = performance.now();
                recordEvent(Events.COMMAND_EXECUTION, {
                    command,
                    success,
                    duration: end - start,
                });
            }
        },
        thisArg
    );
}
