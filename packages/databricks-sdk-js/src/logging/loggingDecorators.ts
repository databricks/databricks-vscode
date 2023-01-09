import "reflect-metadata";
import {NamedLogger} from "./NamedLogger";
import {getContextParamIndex, Context, ContextItems} from "../context";

export function withLogContext(name: string, opName?: string) {
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
            const contextParam = (
                (args[contextParamIndex] as Context | undefined) ??
                new Context()
            ).copy();

            const items: ContextItems = {
                logger,
                opName: contextParam.opName ?? opName,
                rootClassName:
                    contextParam.rootClassName ?? this.constructor.name,
                rootFnName: contextParam.rootFnName ?? _propertyKey,
            };
            contextParam.setItems(items);

            args[contextParamIndex] = contextParam;

            logger.withContext({
                context: contextParam,
                loggingFnName: `${this.constructor.name}.${_propertyKey}`,
            });

            return method.apply(this, args);
        };
    };
}
