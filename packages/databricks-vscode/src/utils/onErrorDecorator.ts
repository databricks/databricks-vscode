import {window} from "vscode";
import {
    getContextParamIndex,
    logging,
    Context,
} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";

interface Props {
    popup?:
        | {
              prefix?: string;
          }
        | boolean; // default false
    log?:
        | {
              prefix?: string;
          }
        | boolean; // default true
}

const defaultProps: Props = {
    popup: false,
    log: true,
};

export function onError(props: Props) {
    props = {...defaultProps, ...props};
    return function showErrorDecorator(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        let contextParamIndex: number = -1;
        // Find the @context if it exists. We want to use it for logging whenever possible.
        if (props.log !== undefined && props.log !== false) {
            try {
                logging.withLogContext(Loggers.Extension)(
                    target,
                    propertyKey,
                    descriptor
                );
                contextParamIndex = getContextParamIndex(target, propertyKey);
            } catch (e) {}
        }
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (e) {
                if (!(e instanceof Error)) {
                    throw e;
                }

                let prefix = "";
                if (props.popup !== undefined && props.popup !== false) {
                    prefix =
                        typeof props.popup !== "boolean"
                            ? props.popup.prefix ?? ""
                            : "";
                    window.showErrorMessage(
                        prefix.trimEnd() + " " + e.message.trimStart()
                    );
                }
                if (props.log !== undefined && props.log !== false) {
                    // If we do not have a context, we create a new logger.
                    const logger =
                        contextParamIndex !== -1
                            ? (args[contextParamIndex] as Context).logger
                            : logging.NamedLogger.getOrCreate(
                                  Loggers.Extension
                              );
                    prefix =
                        props.log === true || props.log.prefix === undefined
                            ? prefix
                            : props.log.prefix;
                    logger?.error(
                        prefix.trimEnd() + " " + e.message.trimStart(),
                        e
                    );
                }
                return;
            }
        };
    };
}
