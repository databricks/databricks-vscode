import {
    NamedLogger,
    ExposedLoggers,
} from "@databricks/databricks-sdk/dist/logging";
import {env, ExtensionContext, window} from "vscode";
import {loggers, format, transports} from "winston";
import {getOutputConsoleTransport} from "./outputConsoleTransport";
import {unlink, access, mkdir} from "fs/promises";
import path from "path";

export class LoggerManager {
    constructor(readonly context: ExtensionContext) {}

    private async getLogFile(prefix: string) {
        await mkdir(this.context.logUri.fsPath, {recursive: true});
        const logFile = path.join(
            this.context.logUri.fsPath,
            `${prefix}-logs.json`
        );
        try {
            await access(logFile);
            await unlink(logFile);
        } catch (e) {}

        return logFile;
    }

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
        outputChannel.clear();

        const sdkAndExtensionLogfile = await this.getLogFile(
            "sdk-and-extension"
        );

        NamedLogger.getOrCreate(
            ExposedLoggers.SDK,
            {
                factory: (name) => {
                    return loggers.add(name, {
                        transports: [
                            getOutputConsoleTransport(outputChannel, {
                                level: "debug",
                            }),
                            this.getFileTransport(sdkAndExtensionLogfile, {
                                level: "debug",
                            }),
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
                        transports: [
                            getOutputConsoleTransport(outputChannel, {
                                level: "error",
                            }),
                            this.getFileTransport(sdkAndExtensionLogfile, {
                                level: "debug",
                            }),
                        ],
                    });
                },
            },
            true
        );

        const bricksLogFile = await this.getLogFile("bricks");
        /** 
        This logger collects all the output from bricks.
        */
        NamedLogger.getOrCreate(
            "Bricks",
            {
                factory: (name) => {
                    return loggers.add(name, {
                        transports: [
                            getOutputConsoleTransport(outputChannel, {
                                level: "error",
                            }),
                            this.getFileTransport(bricksLogFile, {
                                level: "debug",
                            }),
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

/* eslint-disable @typescript-eslint/naming-convention */
export enum Loggers {
    Extension = "Extension",
    Bricks = "Bricks",
}
/* eslint-enable @typescript-eslint/naming-convention */
