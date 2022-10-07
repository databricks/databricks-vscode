import {randomUUID} from "crypto";
import {defaultRedactor} from "../Redactor";
import {DefaultLogger} from "./DefaultLogger";
import {Logger} from "./types";

export enum LEVELS {
    error = "error",
    warn = "warn",
    info = "info",
    debug = "debug",
}

const loggers = new Map<string, LoggerDetails>();

export interface LoggerOpts {
    fieldNameDenyList: string[];
    maxFieldLength: number;
    factory: (name: string) => Logger;
}

export const defaultOpts: LoggerOpts = {
    get fieldNameDenyList(): string[] {
        const denyList: string[] = [];
        if (
            !(
                process.env["DATABRICKS_DEBUG_HEADERS"] &&
                process.env["DATABRICKS_DEBUG_HEADERS"] === "true"
            )
        ) {
            denyList.push(...["headers", "agent"]);
        }
        return denyList;
    },
    get maxFieldLength(): number {
        const defaultLength = 96;
        if (process.env["DATABRICKS_DEBUG_TRUNCATE_BYTES"]) {
            try {
                return parseInt(process.env["DATABRICKS_DEBUG_TRUNCATE_BYTES"]);
            } catch (e) {
                return defaultLength;
            }
        }
        return defaultLength;
    },
    factory: (name) => new DefaultLogger(),
};

interface LoggerDetails {
    name: string;
    logger: Logger;
    opts: LoggerOpts;
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

    private get _logger() {
        return loggers.get(this.name)?.logger;
    }

    private get _loggerOpts() {
        return loggers.get(this.name)?.opts;
    }

    //TODO: consistently obfuscate the names of non exposed loggers
    static getOrCreate(
        name: string,
        opts?: Partial<LoggerOpts>,
        replace = false
    ) {
        const loggerOpts = {...defaultOpts, ...opts};

        if (replace || !loggers.has(name)) {
            loggers.set(name, {
                name: name,
                logger: loggerOpts.factory(name),
                opts: loggerOpts,
            });
        }
        return new NamedLogger(name);
    }

    log(level: string, message?: string, meta?: any) {
        meta = defaultRedactor.sanitize(
            meta,
            this._loggerOpts?.fieldNameDenyList,
            this._loggerOpts?.maxFieldLength
        );
        this._logger?.log(level, message, {
            operationId: this.opId,
            operationName: this.opName,
            timestamp: Date.now(),
            ...meta,
        });
    }

    debug(message?: string, obj?: any) {
        this.log(LEVELS.debug, message, obj);
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
