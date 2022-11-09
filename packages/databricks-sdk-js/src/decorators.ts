import {CancellationToken} from "./types";

/**
 * Wraps an API client function that uses pagination and calles it iteratively to
 * fetch all data.
 */
export function paginated<REQ, RES>(
    paginationKey: keyof (REQ | RES),
    itemsKey: keyof RES
) {
    return function (
        _target: any,
        _propertyKey: string,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor {
        const childFunction = descriptor.value as (
            req: REQ,
            token?: CancellationToken
        ) => Promise<RES>;

        descriptor.value = async function (
            req: REQ,
            token?: CancellationToken
        ): Promise<RES> {
            const results = [];
            let response: RES;
            let paginationToken: any;
            do {
                if (paginationToken) {
                    req[paginationKey] = paginationToken;
                } else {
                    delete req[paginationKey];
                }
                response = await childFunction.call(this, req, token);

                if (token && token.isCancellationRequested) {
                    return response;
                }

                if (response[itemsKey]) {
                    results.push(...(response[itemsKey] as any));
                }
                paginationToken = response[paginationKey];
            } while (paginationToken);

            (response[itemsKey] as any) = results;
            return response;
        };
        return descriptor;
    };
}
