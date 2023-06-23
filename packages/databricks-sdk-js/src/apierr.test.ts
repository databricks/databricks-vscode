import {parseErrorFromResponse} from "./apierr";
import * as assert from "assert";

describe(__filename, () => {
    it("should handle invalid token errors", () => {
        const status = 403;
        const statusMessage = "Forbidden";
        const body = '{"error_code":"403","message":"Invalid access token."}';

        const err = parseErrorFromResponse(status, statusMessage, body);
        assert.equal(err.statusCode, 403);
        assert.equal(err.errorCode, "403");
        assert.equal(err.message, "Invalid access token.");
        assert.equal(err.isRetryable(), false);
    });

    it("should handle 404 for repos", () => {
        const status = 404;
        const statusMessage = "Not Found";
        const body =
            '{"error_code":"RESOURCE_DOES_NOT_EXIST","message":"RESOURCE_DOES_NOT_EXIST: Parent directory /Repos/juhu does not exist."}';

        const err = parseErrorFromResponse(status, statusMessage, body);
        assert.equal(err.statusCode, 404);
        assert.equal(err.errorCode, "RESOURCE_DOES_NOT_EXIST");
        assert.equal(
            err.message,
            "RESOURCE_DOES_NOT_EXIST: Parent directory /Repos/juhu does not exist."
        );
        assert.equal(err.response!.error_code, "RESOURCE_DOES_NOT_EXIST");
        assert.equal(err.isRetryable(), false);
    });

    it("should handle 400 for wrong tenant", () => {
        const status = 400;
        const statusMessage = "Bad Request";
        const body = `<html>
<head>
<meta http-equiv="Content-Type" content="text/html;charset=utf-8"/>
<title>Error 400 io.jsonwebtoken.IncorrectClaimException: Expected iss claim to be: https://sts.windows.net/e3fe3f22-4b98-4c04-82cc-d8817d1b17da/, but was: https://sts.windows.net/9f37a392-f0ae-4280-9796-f1864a10effc/.</title>
</head>
<body><h2>HTTP ERROR 400</h2>
<p>Problem accessing /api/2.0/preview/scim/v2/Me. Reason:
<pre>    io.jsonwebtoken.IncorrectClaimException: Expected iss claim to be: https://sts.windows.net/e3fe3f22-4b98-4c04-82cc-d8817d1b17da/, but was: https://sts.windows.net/9f37a392-f0ae-4280-9796-f1864a10effc/.</pre></p>
</body>
</html>`;
        const err = parseErrorFromResponse(status, statusMessage, body);
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "Bad Request");
        assert.equal(
            err.message,
            "io.jsonwebtoken.IncorrectClaimException: Expected iss claim to be: https://sts.windows.net/e3fe3f22-4b98-4c04-82cc-d8817d1b17da/, but was: https://sts.windows.net/9f37a392-f0ae-4280-9796-f1864a10effc/"
        );

        assert.equal(err.response, body);
        assert.equal(err.isRetryable(), false);
    });

    it("should treat 429 error as retryable", () => {
        const status = 429;
        const statusMessage = "Too Many Requests";
        const body = `{"error_code":"TOO_MANY_REQUESTS","message":"Too many requests"}`;

        const err = parseErrorFromResponse(status, statusMessage, body);
        assert.equal(err.statusCode, 429);
        assert.equal(err.errorCode, "TOO_MANY_REQUESTS");
        assert.equal(err.message, "Too many requests");

        assert.equal(err.isRetryable(), true);
    });
});
