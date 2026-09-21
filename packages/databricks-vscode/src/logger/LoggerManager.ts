import {logging} from "@databricks/sdk-experimental";
import {
    commands,
    env,
    ExtensionContext,
    window,
    LogOutputChannel,
} from "vscode";
import {loggers, format, transports} from "winston";

import {getJsonFormat} from "./truncatedJsonFormat";
import {unlink, access, mkdir} from "fs/promises";
import path from "path";
import {
    LOG_OUTPUT_CHANNEL_LEVELS,
    LogOutputChannelStream,
} from "./OutputConsoleStream";
import {findRevealCommand} from "./outputChannelReveal";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger, ExposedLoggers} = logging;

export type LogChannelName = "Databricks Logs" | "Databricks Bundle Logs";

/**
 * How long to wait before re-looking for a channel's reveal command when the
 * channel was only just created. `createOutputChannel` registers with the
 * workbench asynchronously, so the command may not exist yet on the first try.
 */
const REVEAL_COMMAND_RETRY_DELAY_MS = 200;

/**
 * The VS Code command APIs the reveal logic depends on, injectable so tests can
 * drive the orchestration deterministically. Defaults to the real `commands`.
 */
export interface RevealCommandApi {
    getCommands: () => Thenable<string[]>;
    executeCommand: (command: string) => Thenable<unknown>;
}

const defaultRevealCommandApi: RevealCommandApi = {
    getCommands: () => commands.getCommands(true),
    executeCommand: (command) => commands.executeCommand(command),
};

export class LoggerManager {
    private outputChannels: Map<LogChannelName, LogOutputChannel> = new Map();
    /**
     * Resolved reveal command per channel. `null` is a "no command needed, use
     * `.show()`" sentinel that we cache so repeated reveals don't re-enumerate
     * every registered command; `undefined` (absent key) means "not resolved
     * yet".
     */
    private readonly revealCommands: Map<LogChannelName, string | null> =
        new Map();

    constructor(
        readonly context: ExtensionContext,
        private readonly commandApi: RevealCommandApi = defaultRevealCommandApi
    ) {}

    async getLogFile(prefix: string) {
        await mkdir(this.context.logUri.fsPath, {recursive: true});
        const logFile = path.join(
            this.context.logUri.fsPath,
            `${prefix}-logs.json`
        );
        try {
            await access(logFile);
            await unlink(logFile);
        } catch {}

        return logFile;
    }

    private getLogOutputChannel(name: LogChannelName) {
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

    /**
     * Reveals a log output channel. Any failure to resolve or run the host's
     * reveal command is swallowed and falls back to `LogOutputChannel.show()`,
     * which is correct everywhere the channel ids agree.
     */
    async showOutputChannel(name: LogChannelName): Promise<void> {
        const justCreated = !this.outputChannels.has(name);
        const channel = this.getLogOutputChannel(name);
        try {
            const command = await this.resolveRevealCommand(name, justCreated);
            if (command !== null) {
                await this.commandApi.executeCommand(command);
                return;
            }
        } catch (e) {
            // A cached command id can go stale, so drop it and let the next
            // call re-resolve instead of failing for the rest of the session.
            this.revealCommands.delete(name);
            NamedLogger.getOrCreate(Loggers.Extension).debug(
                `Could not reveal the "${name}" output channel by command, falling back to show()`,
                e
            );
        }
        channel.show();
    }

    /**
     * Resolves the reveal command for a channel, or `null` when plain `.show()`
     * is correct (the ids agree). Both outcomes are cached; on the `justCreated`
     * path an unresolved command is left uncached so a later call retries, since
     * the workbench may not have registered it yet.
     */
    private async resolveRevealCommand(
        name: LogChannelName,
        justCreated: boolean
    ): Promise<string | null> {
        const cached = this.revealCommands.get(name);
        if (cached !== undefined) {
            return cached;
        }

        const extensionId = this.context.extension.id;
        let command = await findRevealCommand(
            extensionId,
            name,
            this.commandApi.getCommands
        );
        if (command === undefined && justCreated) {
            await new Promise((resolve) =>
                setTimeout(resolve, REVEAL_COMMAND_RETRY_DELAY_MS)
            );
            command = await findRevealCommand(
                extensionId,
                name,
                this.commandApi.getCommands
            );
        }

        if (command !== undefined) {
            this.revealCommands.set(name, command);
            NamedLogger.getOrCreate(Loggers.Extension).debug(
                `Revealing the "${name}" output channel via ${command}, as the host registered it under a scoped id`
            );
            return command;
        }

        // No scoped command found. Cache the "use .show()" sentinel unless the
        // channel was only just created — then the command may simply not be
        // registered yet, so leave it unresolved for the next call to retry.
        if (!justCreated) {
            this.revealCommands.set(name, null);
        }
        return null;
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
export enum Loggers {
    Extension = "Extension",
    Bundle = "Bundle",
}
/* eslint-enable @typescript-eslint/naming-convention */
