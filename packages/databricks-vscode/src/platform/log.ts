import fs from "node:fs";
import path from "node:path";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface Logger {
    trace(message: string, ...data: unknown[]): void;
    debug(message: string, ...data: unknown[]): void;
    info(message: string, ...data: unknown[]): void;
    warn(message: string, ...data: unknown[]): void;
    error(message: string, ...data: unknown[]): void;
    /** A logger whose entries are tagged `<this name>.<name>`. */
    child(name: string): Logger;
}

/** The subset of `vscode.LogOutputChannel` the log writes to. */
export interface LogChannel {
    trace(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

export interface LogEntry {
    readonly timestamp: string;
    readonly level: LogLevel;
    readonly logger: string;
    readonly message: string;
    readonly data?: unknown[];
}

export interface LogSink {
    write(entry: LogEntry): void;
    dispose(): void;
}

export const LOG_CHANNEL_NAME = "Databricks Logs";
export const LOG_FILE_NAME = "sdk-and-extension-logs.json";

/**
 * Writes every entry, at every level, as one JSON line. The file is recreated
 * on each activation so the harness collects only the current session.
 */
export class JsonFileSink implements LogSink {
    private readonly stream: fs.WriteStream;

    constructor(readonly filePath: string) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        this.stream = fs.createWriteStream(filePath, { flags: "w" });
        // A failing log file must never take the extension down.
        this.stream.on("error", () => {});
    }

    write(entry: LogEntry): void {
        this.stream.write(JSON.stringify(entry, jsonReplacer()) + "\n");
    }

    dispose(): void {
        this.stream.end();
    }
}

/** Shows entries in the "Databricks Logs" channel; VS Code filters the level. */
export class ChannelSink implements LogSink {
    constructor(private readonly channel: LogChannel) {}

    write(entry: LogEntry): void {
        this.channel[entry.level](
            `[${entry.logger}] ${entry.message}`,
            ...(entry.data ?? []).map(toPlain),
        );
    }

    dispose(): void {}
}

export class Log implements Logger {
    constructor(
        private readonly sinks: readonly LogSink[],
        private readonly name: string,
        private readonly now: () => Date = () => new Date(),
    ) {}

    trace(message: string, ...data: unknown[]) {
        this.write("trace", message, data);
    }
    debug(message: string, ...data: unknown[]) {
        this.write("debug", message, data);
    }
    info(message: string, ...data: unknown[]) {
        this.write("info", message, data);
    }
    warn(message: string, ...data: unknown[]) {
        this.write("warn", message, data);
    }
    error(message: string, ...data: unknown[]) {
        this.write("error", message, data);
    }

    child(name: string): Logger {
        return new Log(this.sinks, `${this.name}.${name}`, this.now);
    }

    private write(level: LogLevel, message: string, data: unknown[]) {
        const entry: LogEntry = {
            timestamp: this.now().toISOString(),
            level,
            logger: this.name,
            message,
            ...(data.length > 0 ? { data: data.map(toPlain) } : {}),
        };
        for (const sink of this.sinks) {
            try {
                sink.write(entry);
            } catch {
                // Logging is best effort.
            }
        }
    }
}

/** Errors don't survive `JSON.stringify`, so flatten them first. */
function toPlain(value: unknown): unknown {
    if (value instanceof Error) {
        const plain: Record<string, unknown> = {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
        if ("code" in value) {
            plain.code = value.code;
        }
        if (value.cause !== undefined) {
            plain.cause = toPlain(value.cause);
        }
        return plain;
    }
    return value;
}

/** Replaces cycles, which would make `JSON.stringify` throw. */
function jsonReplacer() {
    const seen = new WeakSet();
    return (_key: string, value: unknown) => {
        if (typeof value === "bigint") {
            return value.toString();
        }
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    };
}
