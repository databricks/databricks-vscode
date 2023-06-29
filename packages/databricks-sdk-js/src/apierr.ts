/* eslint-disable @typescript-eslint/naming-convention */
const transientErrorStringMatches = [
    "com.databricks.backend.manager.util.UnknownWorkerEnvironmentException",
    "does not have any associated worker environments",
    "There is no worker environment with id",
    "Unknown worker environment",
    "ClusterNotReadyException",
    "connection reset by peer",
    "TLS handshake timeout",
    "connection refused",
    "Unexpected error",
    "i/o timeout",
];

export class HttpError extends Error {
    constructor(readonly message: string, readonly code: number) {
        super(message);
    }
}

export class ApiError extends Error {
    constructor(
        public readonly message: string,
        public readonly errorCode: string,
        public readonly statusCode: number,
        public readonly response: any
    ) {
        super(message);
    }

    isRetryable(): boolean {
        if (this.statusCode === 429) {
            return true;
        }
        if (this.statusCode >= 400) {
            if (this.isTransientError(this.message)) {
                return true;
            }
        }

        // some API's recommend retries on HTTP 500, but we'll add that later
        return false;
    }

    private isTransientError(body: string): boolean {
        return transientErrorStringMatches.some((s) => body.includes(s));
    }
}

export interface ApiErrorBody {
    error_code: string;
    message: string;

    // The following two are for scim api only
    // for RFC 7644 Section 3.7.3 https://tools.ietf.org/html/rfc7644#section-3.7.3
    detail?: string;
    status?: string;
    scimType?: string;
    error?: string;
}

export function parseErrorFromResponse(
    statusCode: number,
    statusMessage: string,
    body: string
): ApiError {
    // try to read in nicely formatted API error response
    let errorJson: ApiErrorBody | undefined;
    try {
        errorJson = JSON.parse(body) as ApiErrorBody;
    } catch (e) {}

    let errorBody: ApiErrorBody;
    if (!errorJson || !errorJson.message || !errorJson.error_code) {
        errorBody = parseUnknownError(statusMessage, body);
    } else {
        errorBody = errorJson;
    }

    // API 1.2 has different response format, let's adapt
    if (errorBody.error) {
        errorBody.message = errorBody.error || "";
    }

    // Handle SCIM error message details
    if (!errorBody.message && errorBody.detail) {
        if (errorBody.detail === "null") {
            errorBody.message = "SCIM API Internal Error";
        } else {
            errorBody.message = errorBody.detail || "";
        }
        // add more context from SCIM responses
        errorBody.message = `${errorBody.scimType} ${errorBody.message}`;
        errorBody.message = errorBody.message.trim();
        errorBody.error_code = `SCIM_${errorBody.status}`;
    }

    return new ApiError(
        errorBody.message,
        errorBody.error_code,
        statusCode,
        errorJson || body
    );
}

export function parseUnknownError(
    statusMessage: string,
    body: string
): ApiErrorBody {
    // this is most likely HTML... since parsing JSON failed
    // Status parts first in case html message is not as expected
    const errorCode = statusMessage || "UNKNOWN";
    let message: string;

    const m = body.match(/<pre>(.*)<\/pre>/);
    if (m) {
        message = m[1].trim().replace(/([\s.])*$/, "");
    } else {
        // When the AAD tenant is not configured correctly, the response is a HTML page with a title like this:
        // "Error 400 io.jsonwebtoken.IncorrectClaimException: Expected iss claim to be: https://sts.windows.net/aaaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa/, but was: https://sts.windows.net/bbbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb/."
        const m = body.match(/<title>(Error \d+.*?)<\/title>/);
        if (m) {
            message = m[1].trim().replace(/([\s.])*$/, "");
        } else {
            message = `Response from server (${statusMessage}) ${body}`;
        }
    }

    return {
        error_code: errorCode,
        message: message,
    };
}
