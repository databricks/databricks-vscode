import {
    NamedLogger,
    ExposedLoggers,
} from "@databricks/databricks-sdk/dist/logging";
import {env, ExtensionContext, window} from "vscode";
import {loggers, format, transports} from "winston";
import {getOutputConsoleTransport} from "./outputConsoleTransport";
import {unlink, access} from "fs/promises";

export class LoggerManager {
    constructor(readonly context: ExtensionContext) {}

    private getFileTransport(filename: string) {
        return new transports.File({
            format: format.combine(format.timestamp(), format.json()),
            filename: filename,
        });
    }

    async initLoggers() {
        const outputChannel = window.createOutputChannel("Databricks Logs");
        const logFile = `${this.context.logUri.path}/logs.json`;
        try {
            await access(logFile);
            await unlink(logFile);
        } catch (e) {}

        outputChannel.clear();

        NamedLogger.getOrCreate(
            ExposedLoggers.SDK,
            {
                factory: (name) => {
                    return loggers.add(name, {
                        level: "debug",
                        transports: [
                            getOutputConsoleTransport(outputChannel),
                            this.getFileTransport(logFile),
                        ],
                    });
                },
            },
            true
        );

        /** 
        This logger collects all the logs in the extension.
        
        TODO Make this logger log to a seperate (or common?) output console in vscode
        */
        NamedLogger.getOrCreate(
            "Extension",
            {
                factory: (name) => {
                    return loggers.add(name, {
                        level: "error",
                        transports: [
                            getOutputConsoleTransport(outputChannel),
                            this.getFileTransport(logFile),
                        ],
                    });
                },
            },
            true
        );
    }

    openLogFolder() {
        env.openExternal(this.context.logUri);
    }
}

export enum Loggers {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Extension = "Extension",
}
