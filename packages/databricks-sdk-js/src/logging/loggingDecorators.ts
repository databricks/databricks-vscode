import {NamedLogger} from "./NamedLogger";

export const LOG_ID_ELEMENT_KEY = Symbol.for("log_id");
export const LOGGER_ELEMENT_KEY = Symbol.for("logger");

function logElement(elementKey: Symbol) {
    return function (
        _target: any,
        _propertyKey: string,
        parameterIndex: number
    ) {
        const existingParameters: number[] =
            Reflect.getOwnMetadata(elementKey, _target, _propertyKey) || [];
        existingParameters.push(parameterIndex);
        Reflect.defineMetadata(
            elementKey,
            existingParameters,
            _target,
            _propertyKey
        );
    };
}

export function logOpId() {
    return logElement(LOG_ID_ELEMENT_KEY);
}

export function loggerInstance() {
    return logElement(LOGGER_ELEMENT_KEY);
}

export function withLogContext(name: string) {
    return function (
        _target: any,
        _propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const method = descriptor.value;

        const idParams: number[] = Reflect.getOwnMetadata(
            LOG_ID_ELEMENT_KEY,
            _target,
            _propertyKey
        );
        if (idParams.length !== 1) {
            throw Error(
                `Use @logElement(LOG_ID_ELEMENT_KEY) to specify exactly 1 parameter of ${_propertyKey} as log id`
            );
        }

        const loggerParams: number[] = Reflect.getOwnMetadata(
            LOGGER_ELEMENT_KEY,
            _target,
            _propertyKey
        );
        if (idParams.length > 1) {
            throw Error(
                `Use @logElement(LOGGER_ELEMENT_KEY) to specify maximum 1 parameter of ${_propertyKey} as logger`
            );
        }

        descriptor.value = function (...args: any[]) {
            const logger = NamedLogger.getOrCreate(name);
            const logIdArg =
                args.length > idParams[0] ? args[idParams[0]] : undefined;

            while (loggerParams.length === 1 && args.length < loggerParams[0]) {
                args.push(undefined);
            }
            args.push(logger);
            return logger.withContext({
                opId: logIdArg,
                opName: `${this.constructor.name}.${_propertyKey}`,
                fn: () => method.apply(this, args),
            });
        };
    };
}
