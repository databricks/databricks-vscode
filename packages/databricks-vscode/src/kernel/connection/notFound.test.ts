import { ApiError } from "@databricks/sdk-core/apierror";
import { describe, expect, it } from "vitest";
import { isNotFound } from "./notFound";

function apiError(status: number, code: string) {
    return ApiError.fromHttpError(
        status,
        new Headers(),
        new TextEncoder().encode(JSON.stringify({ error_code: code, message: "m" })),
    );
}

describe("isNotFound", () => {
    it("treats a 404, and RESOURCE_DOES_NOT_EXIST with any status, as not found", () => {
        expect(isNotFound(apiError(404, "ENDPOINT_NOT_FOUND"))).toBe(true);
        expect(isNotFound(apiError(400, "RESOURCE_DOES_NOT_EXIST"))).toBe(true);
        expect(isNotFound(apiError(400, "INVALID_PARAMETER_VALUE"))).toBe(false);
        expect(isNotFound(new Error("RESOURCE_DOES_NOT_EXIST"))).toBe(false);
    });
});
