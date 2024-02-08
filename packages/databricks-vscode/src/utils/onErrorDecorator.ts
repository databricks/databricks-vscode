import {window} from "vscode";
import {
    getContextParamIndex,
    logging,
    Context,
} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";

interface OnErrorProps {
    popup?: {
        prefix?: string;
    };
    log?: {
        prefix?: string;
        logger?: logging.NamedLogger;
    };
    throw?: boolean;
}

type Props = {
    [key in keyof OnErrorProps]?: OnErrorProps[key] | boolean;
};

const defaultProps: Props = {
    popup: false,
    log: true,
    throw: false,
};

export function onError(props: Props) {
    props = {...defaultProps, ...props};
    return function showErrorDecorator(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        let closureArgs: any[] = [];
        let contextParamIndex: number = -1;
        // Find the @context if it exists. We want to use it for logging whenever possible.
        if (
            props.log !== undefined &&
            props.log !== false &&
            (props.log === true || props.log?.logger === undefined)
        ) {
            try {
                // This will decorate the method with a log context. This allows us to search for the context parameter.
                logging.withLogContext(Loggers.Extension)(
                    target,
                    propertyKey,
                    descriptor
                );
                contextParamIndex = getContextParamIndex(target, propertyKey);
                if (contextParamIndex !== -1) {
                    props.log = {
                        get logger() {
                            return (closureArgs[contextParamIndex] as Context)
                                .logger;
                        },
                    };
                }
            } catch (e) {}
        }
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            closureArgs = args;
            return await withOnErrorHandler(
                originalMethod.bind(this),
                props
            )(...args);
        };
    };
}

export function withOnErrorHandler<T extends any[], U>(
    fn: (...args: T) => Promise<U>,
    props: Props = {}
) {
    props = {...defaultProps, ...props};

    const onErrorProps: OnErrorProps = {};

    (["popup", "log"] as const).forEach((key) => {
        if (props[key] === undefined || props[key] === false) {
            onErrorProps[key] = undefined;
        } else if (props[key] === true) {
            onErrorProps[key] = {};
        } else {
            onErrorProps[key] = props[key] as any;
        }
    });

    return async function (...args: T): Promise<U | undefined> {
        try {
            const result = fn(...args);
            return result instanceof Promise ? await result : result;
        } catch (e) {
            if (!(e instanceof Error)) {
                throw e;
            }

            let prefix = "";
            if (onErrorProps.popup) {
                prefix = onErrorProps.popup?.prefix ?? prefix;
                window.showErrorMessage(
                    prefix.trimEnd() + " " + e.message.trimStart()
                );
            }
            if (onErrorProps.log) {
                prefix = onErrorProps.log?.prefix ?? prefix;
                const logger =
                    onErrorProps.log?.logger ??
                    logging.NamedLogger.getOrCreate(Loggers.Extension);
                logger.error(prefix.trimEnd() + " " + e.message.trimStart(), e);
            }

            if (onErrorProps.throw) {
                throw e;
            }
        }
    };
}
