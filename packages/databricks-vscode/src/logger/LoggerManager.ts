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

    private getFileTransport(
        filename: string,
        extraOptions?: Omit<
            transports.FileTransportOptions,
            "filename" | "format"
        >
    ) {
        return new transports.File({
            format: format.combine(format.timestamp(), format.json()),
            filename: filename,
            ...extraOptions,
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
                            getOutputConsoleTransport(outputChannel, {
                                level: "debug",
                            }),
                            this.getFileTransport(logFile, {level: "all"}),
                        ],
                    });
                },
            },
            true
        );

        /** 
        This logger collects all the logs in the extension.
        */
        NamedLogger.getOrCreate(
            "Extension",
            {
                factory: (name) => {
                    return loggers.add(name, {
                        level: "error",
                        transports: [
                            getOutputConsoleTransport(outputChannel, {
                                level: "error",
                            }),
                            this.getFileTransport(logFile, {level: "all"}),
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
