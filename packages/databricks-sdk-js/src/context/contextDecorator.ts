import "..";
const CONTEXT_SYMBOL = Symbol.for("context");

export function context(
    _target: any,
    _propertyKey: string,
    parameterIndex: number
) {
    const existingParameters: number[] =
        Reflect.getOwnMetadata(CONTEXT_SYMBOL, _target, _propertyKey) || [];
    existingParameters.push(parameterIndex);
    Reflect.defineMetadata(
        CONTEXT_SYMBOL,
        existingParameters,
        _target,
        _propertyKey
    );
}

export function getContextParamIndex(_target: any, _propertyKey: string) {
    const contextParams: number[] = Reflect.getOwnMetadata(
        CONTEXT_SYMBOL,
        _target,
        _propertyKey
    );
    if (contextParams.length !== 1) {
        throw Error(
            `Use @context to specify exactly 1 parameter of ${_propertyKey} as context`
        );
    }
    return contextParams[0];
}
