import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "./LoggerManager";

export interface TryAndLogErrorOpts {
    shouldThrow: boolean;
    message: string;
    logger: Loggers;
}

const defaultTryAndLogErrorOpts: TryAndLogErrorOpts = {
    shouldThrow: true,
    message: "",
    logger: Loggers.Extension,
};

export async function tryAndLogErrorAsync<T>(
    fn: () => Promise<T>,
    opts: Partial<TryAndLogErrorOpts> = {}
): Promise<T | undefined> {
    const mergedOpts: TryAndLogErrorOpts = {
        ...defaultTryAndLogErrorOpts,
        ...opts,
    };

    try {
        return await fn();
    } catch (e) {
        NamedLogger.getOrCreate(mergedOpts.logger).error(mergedOpts.message, e);
        if (mergedOpts.shouldThrow) {
            throw e;
        }
    }
}

export function tryAndLogError<T>(
    fn: () => T,
    opts: Partial<TryAndLogErrorOpts> = {}
): T | undefined {
    const mergedOpts: TryAndLogErrorOpts = {
        ...defaultTryAndLogErrorOpts,
        ...opts,
    };

    try {
        return fn();
    } catch (e) {
        NamedLogger.getOrCreate(mergedOpts.logger).error(mergedOpts.message, e);
        if (mergedOpts.shouldThrow) {
            throw e;
        }
    }
}
