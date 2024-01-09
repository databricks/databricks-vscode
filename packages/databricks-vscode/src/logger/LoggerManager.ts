import {logging} from "@databricks/databricks-sdk";
import {env, ExtensionContext, window} from "vscode";
import {loggers, format, transports} from "winston";
import {getOutputConsoleTransport} from "./outputConsoleTransport";
import {unlink, access, mkdir} from "fs/promises";
import path from "path";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger, ExposedLoggers} = logging;

export class LoggerManager {
    constructor(readonly context: ExtensionContext) {}

    async getLogFile(prefix: string) {
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

        const sdkAndExtensionLogfile =
            await this.getLogFile("sdk-and-extension");

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

        // This logger collects all the logs in the extension.
        NamedLogger.getOrCreate(
            Loggers.Extension,
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
    }

    openLogFolder() {
        env.openExternal(this.context.logUri);
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
export enum Loggers {
    Extension = "Extension",
}
/* eslint-enable @typescript-eslint/naming-convention */
