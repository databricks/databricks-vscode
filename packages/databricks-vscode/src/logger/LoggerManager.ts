import {logging} from "@databricks/databricks-sdk";
import {env, ExtensionContext, window, LogOutputChannel} from "vscode";
import {loggers, format, transports} from "winston";

import {getJsonFormat} from "./truncatedJsonFormat";
import {unlink, access, mkdir} from "fs/promises";
import path from "path";
import {
    LOG_OUTPUT_CHANNEL_LEVELS,
    LogOutputChannelStream,
} from "./OutputConsoleStream";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger, ExposedLoggers} = logging;

export class LoggerManager {
    private outputChannels: Map<string, LogOutputChannel> = new Map();

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

    private getLogOutputChannel(
        name: "Databricks Logs" | "Databricks Bundle Logs"
    ) {
        if (!this.outputChannels.has(name)) {
            const outputChannel = window.createOutputChannel(name, {log: true});
            outputChannel.clear();
            this.outputChannels.set(name, outputChannel);
        }
        return this.outputChannels.get(name)!;
    }

    async initLoggers() {
        /**
         * We need to create a new transport for each log levle.
         * This because the log output channel requires different functions to print different levels of log.
         * Since the log output channel is part of the stream, which does not get the log level as input ever,
         * we need to specify the log level of the stream at object initialisation time.
         */
        const commonLogTransports = [
            ...LOG_OUTPUT_CHANNEL_LEVELS.map(
                (level) =>
                    new transports.Stream({
                        stream: new LogOutputChannelStream(
                            this.getLogOutputChannel("Databricks Logs"),
                            level,
                            {
                                defaultEncoding: "utf-8",
                            }
                        ),
                        format: format.combine(
                            // Since we want each stream to be targeted to a specific log level,
                            // we need to filter the logs by level. Returning false from the first format
                            // will prevent the log from being printed.
                            format((info) => info.level === level && info)(),
                            getJsonFormat()
                        ),
                        level,
                    })
            ),
            new transports.File({
                format: format.combine(format.timestamp(), format.json()),
                filename: await this.getLogFile("sdk-and-extension"),
                level: "debug",
            }),
        ];

        NamedLogger.getOrCreate(
            ExposedLoggers.SDK,
            {
                factory: (name) => {
                    return loggers.add(name, {
                        transports: commonLogTransports,
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
                        transports: commonLogTransports,
                    });
                },
            },
            true
        );

        /**
         * We need to create a new transport for each log levle.
         * This because the log output channel requires different functions to print different levels of log.
         * Since the log output channel is part of the stream, which does not get the log level as input ever,
         * we need to specify the log level of the stream at object initialisation time.
         */
        const bundleTransports = LOG_OUTPUT_CHANNEL_LEVELS.filter(
            (i) => i !== "debug" && i !== "trace" //Only log info, error, warn
        ).map(
            (level) =>
                new transports.Stream({
                    stream: new LogOutputChannelStream(
                        this.getLogOutputChannel("Databricks Bundle Logs"),
                        level,
                        {
                            defaultEncoding: "utf-8",
                        }
                    ),
                    format: format.combine(
                        // Since we want each stream to be targeted to a specific log level,
                        // we need to filter the logs by level. Returning false from the first format
                        // will prevent the log from being printed.
                        format((info) => info.level === level && info)(),
                        format.timestamp(),
                        format.printf((info) => {
                            const name =
                                info.bundleOpName ?? info.error?.bundleOpName;
                            return `${name}: ${info.message}`;
                        })
                    ),
                    level,
                })
        );

        NamedLogger.getOrCreate(
            Loggers.Bundle,
            {
                factory: (name) => {
                    return loggers.add(name, {
                        transports: [
                            ...commonLogTransports,
                            ...bundleTransports,
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

    showOutputChannel(name: "Databricks Logs" | "Databricks Bundle Logs") {
        this.getLogOutputChannel(name).show();
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
export enum Loggers {
    Extension = "Extension",
    Bundle = "Bundle",
}
/* eslint-enable @typescript-eslint/naming-convention */
