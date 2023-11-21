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
        | true;
    log?:
        | {
              prefix?: string;
          }
        | true;
}

const defaultProps: Props = {
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
        if (props.log !== undefined) {
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
                if (props.popup !== undefined) {
                    prefix =
                        typeof props.popup !== "boolean"
                            ? props.popup.prefix ?? ""
                            : "";
                    window.showErrorMessage(prefix + e.message);
                }
                if (props.log !== undefined) {
                    // If we do not have a context, we create a new logger.
                    const logger =
                        contextParamIndex !== -1
                            ? (args[contextParamIndex] as Context).logger
                            : logging.NamedLogger.getOrCreate(
                                  Loggers.Extension
                              );
                    prefix =
                        props.log === true
                            ? prefix
                            : props.log.prefix ?? prefix;
                    logger?.error(prefix + e.message, e);
                }
                return;
            }
        };
    };
}
