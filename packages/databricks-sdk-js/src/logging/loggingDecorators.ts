import "..";
import {NamedLogger} from "./NamedLogger";
import {getContextParamIndex, Context} from "../context";

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
            contextParam.setItems({logger});
            args[contextParamIndex] = contextParam;

            return logger.withContext({
                opId: contextParam.opId,
                opName: `${this.constructor.name}.${_propertyKey}`,
                fn: () => method.apply(this, args),
            });
        };
    };
}
