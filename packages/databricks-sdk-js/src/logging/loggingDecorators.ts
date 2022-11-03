import "..";
import {NamedLogger} from "./NamedLogger";
import {getContextParamIndex, Context, ContextItems} from "../context";

export function withLogContext(name: string) {
    return function (
        _target: any,
        _propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const method = descriptor.value;

        const contextParamIndex = getContextParamIndex(_target, _propertyKey);

        descriptor.value = function (...args: any[]) {
            const logger = NamedLogger.getOrCreate(name);
            while (args.length <= contextParamIndex) {
                args.push(undefined);
            }
            const contextParam =
                (args[contextParamIndex] as Context | undefined) ??
                new Context();

            const items: ContextItems = {logger};
            if (contextParam.opName === undefined) {
                items.opName = `${this.constructor.name}.${_propertyKey}`;
            }
            contextParam.setItems(items);

            args[contextParamIndex] = contextParam;

            return logger.withContext({
                context: contextParam,
                loggingFnName: `${this.constructor.name}.${_propertyKey}`,
                fn: () => method.apply(this, args),
            });
        };
    };
}
