import {Events, Telemetry} from ".";
import {commands, Disposable} from "vscode";

declare module "." {
    interface Telemetry {
        /**
         * Wrapper function for commands.registerCommand adding instrumentation.
         *
         * The arguments to this function should be exactly the same as would be passed to
         * commands.registerCommand, and the return value is also the same.
         */
        registerCommand(
            command: string,
            callback: (...args: any[]) => any,
            thisArg?: any
        ): Disposable;
    }
}

Telemetry.prototype.registerCommand = function (
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
                this.recordEvent(Events.COMMAND_EXECUTION, {
                    command,
                    success,
                    duration: end - start,
                });
            }
        },
        thisArg
    );
};
