import {Context} from "../context";
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
    factory: () => new DefaultLogger(),
};

interface LoggerDetails {
    name: string;
    logger: Logger;
    opts: LoggerOpts;
}

export class NamedLogger {
    private constructor(readonly name: string) {}
    private _context?: Context;
    private _loggingFnName?: string;

    get opId() {
        return this._context?.opId;
    }
    get opName() {
        const rootNames = [
            this._context?.rootClassName,
            this._context?.rootFnName,
        ].filter((e) => e !== undefined);

        return this._context?.opName ?? rootNames.length !== 0
            ? rootNames.join(".")
            : undefined;
    }

    get loggingFnName() {
        return this._loggingFnName;
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
        if (level === "error") {
            if (Object(meta) === meta) {
                meta = {
                    ...Object.getOwnPropertyNames(meta).reduce((acc, i) => {
                        acc[i] = (meta as any)[i];
                        return acc;
                    }, {} as any),
                    ...(meta as any),
                };
            }

            meta = {error: meta};
        }

        meta = defaultRedactor.sanitize(
            meta,
            this._loggerOpts?.fieldNameDenyList
        );

        this._logger?.log(level, message, {
            logger: this.name,
            operationId: this.opId,
            operationName: this.opName,
            loggingFunction: this.loggingFnName,
            timestamp: Date.now(),
            ...meta,
        });
    }

    debug(message?: string, obj?: any) {
        this.log(LEVELS.debug, message, obj);
    }

    error(message?: string, obj?: any) {
        this.log(LEVELS.error, message, obj);
    }

    withContext({
        context,
        loggingFnName,
    }: {
        context?: Context;
        loggingFnName?: string;
    }) {
        this._context = context ?? this._context;
        this._loggingFnName = loggingFnName ?? this._loggingFnName;
        return this;
    }
}
