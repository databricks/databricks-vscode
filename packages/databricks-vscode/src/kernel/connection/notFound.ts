import { ApiError } from "@databricks/sdk-core/apierror";

/** A 404, or `RESOURCE_DOES_NOT_EXIST`, which the API also sends with a 400. */
export function isNotFound(error: unknown): boolean {
    return (
        error instanceof ApiError &&
        (error.httpStatusCode === 404 || error.code === "RESOURCE_DOES_NOT_EXIST")
    );
}
