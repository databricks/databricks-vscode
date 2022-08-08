import {CancellationToken} from "./types";

export function paginated<REQ, RES>(
    paginationKey: keyof (REQ | RES),
    itemsKey: keyof RES
) {
    return function (
        _target: any,
        _propertyKey: string,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor {
        const childFunction = descriptor.value as (req: REQ) => Promise<RES>;
        descriptor.value = async function (
            req: REQ,
            token?: CancellationToken
        ): Promise<RES> {
            let results = [];
            let response: RES;
            let paginationToken: any;
            do {
                if (paginationToken) {
                    req[paginationKey] = paginationToken;
                } else {
                    delete req[paginationKey];
                }
                response = await childFunction.call(this, req);

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
