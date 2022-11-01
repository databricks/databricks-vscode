/*
Standard Error class has message and stack fields set as non enumerable.
To correctly account for all such fields, we iterate over all own-properties of
the error object and accumulate them as enumerable fields in the final err object.
*/
export function liftAllErrorProps(err: unknown) {
    if (Object(err) === err) {
        err = {
            ...Object.getOwnPropertyNames(err).reduce((acc, i) => {
                acc[i] = (err as any)[i];
                return acc;
            }, {} as any),
            ...(err as any),
        };
    }
    return err;
}
