import { commands } from "vscode";
import { recordEvent, Events } from "../telemetry";

export function registerCommand(
    command: string,
    callback: (...args: any[]) => any,
    thisArg?: any
) {
    return commands.registerCommand(
        command,
        (...args) => {
            const start = performance.now();
            let success: boolean = true;
            try {
                return callback.call(thisArg, ...args);
            } catch (e: any) {
                success = false;
                throw e;
            } finally {
                const end = performance.now();
                recordEvent({
                    eventName: Events.COMMAND_EXECUTION,
                    properties: { command, success },
                    metrics: { duration: end - start }
                });
            }
        },
        thisArg
    );
}
