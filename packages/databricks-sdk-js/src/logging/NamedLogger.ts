import {randomUUID} from "crypto";
import {format, LogEntry, LoggerOptions, loggers} from "winston";
import {defaultRedactor} from "../Redactor";

export enum LEVELS {
    error = "error",
    warn = "warn",
    info = "info",
    debug = "debug",
}

export type LogItem = {
    level: string;
    message: string;
    operationId?: string;
    [k: string]: any;
};

function createNamedLogger(
    name: string,
    opts?: Omit<LoggerOptions, "format" | "levels">
) {
    loggers.add(name, {
        format: format.combine(
            format.timestamp({
                format: () => Date.now().toString(),
            }),
            format.json(),
            format((info) => {
                const currentMessage = (info as any)[Symbol.for("message")];
                (info as any)[Symbol.for("message")] =
                    defaultRedactor.redactToString(currentMessage);
                return info;
            })()
        ),
        levels: {
            error: 40,
            warn: 30,
            info: 20,
            debug: 10,
        },
        ...opts,
    });
}

export class NamedLogger {
    private constructor(readonly name: string) {}
    private _opId?: string;
    private set opId(id: string | undefined) {
        this._opId = id;
    }
    get opId() {
        return this._opId;
    }

    private _opName?: string;
    private set opName(opName: string | undefined) {
        this._opName = opName;
    }
    get opName() {
        return this._opName;
    }

    get _logger() {
        return loggers.get(this.name);
    }

    //TODO: consistently obfuscate the names of non exposed loggers
    static getOrCreate(name: string) {
        if (!loggers.has(name)) {
            createNamedLogger(name);
        }
        return new NamedLogger(name);
    }

    log({level, ...rest}: LogEntry) {
        this._logger.log({
            level: level.toString(),
            operationId: this.opId,
            operationName: this.opName,
            ...rest,
        });
    }

    configure(opts: Omit<LoggerOptions, "format" | "levels">) {
        this._logger.configure(opts);
    }

    debug({message, ...rest}: Omit<LogEntry, "level">) {
        this.log({
            level: LEVELS.debug,
            message,
            ...rest,
        });
    }

    withContext<T>({
        opId,
        opName,
        fn,
    }: {
        opId?: string;
        opName?: string;
        fn: () => T;
    }) {
        if (opId) {
            this.opId = opId;
        } else {
            this.opId = randomUUID();
        }

        this.opName = opName;

        return fn();
    }
}
