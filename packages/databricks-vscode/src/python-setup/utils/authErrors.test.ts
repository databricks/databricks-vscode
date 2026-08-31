import {expect} from "chai";
import {isReauthRequiredError} from "./authErrors";

/**
 * The verbatim CLI abort the extension sees when the active profile's session
 * has expired: a parse error (no JSON on stdout) with the CLI's auth diagnostic
 * appended from stderr by the setup-local gateway.
 */
const EXPIRED_SESSION_MSG =
    "CLI did not return valid JSON: Unexpected end of JSON input\n" +
    "Error: A new access token could not be retrieved because the refresh " +
    "token is invalid. To reauthenticate, run the following command: " +
    "$ databricks auth login --profile dev";

describe("isReauthRequiredError", () => {
    it("matches the expired-session CLI abort", () => {
        expect(isReauthRequiredError(EXPIRED_SESSION_MSG)).to.be.true;
    });

    it("matches the hyphenated re-authenticate spelling", () => {
        expect(
            isReauthRequiredError(
                "Error: token expired. To re-authenticate, run: databricks auth login --profile dev"
            )
        ).to.be.true;
    });

    it("matches when the cause is split across lines (whitespace collapsed)", () => {
        expect(
            isReauthRequiredError(
                "Error: the refresh token\nis invalid.\nRun: databricks   auth   login"
            )
        ).to.be.true;
    });

    it("matches the access-token-could-not-be-retrieved cause", () => {
        expect(
            isReauthRequiredError(
                "a new access token could not be retrieved. run databricks auth login to continue"
            )
        ).to.be.true;
    });

    it("is case-insensitive", () => {
        expect(
            isReauthRequiredError(
                "THE REFRESH TOKEN IS INVALID. RUN DATABRICKS AUTH LOGIN"
            )
        ).to.be.true;
    });

    // Precision: a false positive would mislabel a real defect as expiry and
    // suppress its report, so these must NOT match.
    it("does not match a generic parse error with no auth signature", () => {
        expect(
            isReauthRequiredError(
                "CLI did not return valid JSON: Unexpected end of JSON input"
            )
        ).to.be.false;
    });

    it("does not match a network failure that merely mentions a login host", () => {
        expect(
            isReauthRequiredError(
                "error: failed to reach https://login.example.com: connection refused"
            )
        ).to.be.false;
    });

    it("does not match a package-index fetch failure", () => {
        expect(
            isReauthRequiredError(
                "error: Failed to fetch: `https://pypi.org/simple/ipykernel/`\n" +
                    "  Caused by: tcp connect error: Connection refused (os error 61)"
            )
        ).to.be.false;
    });

    it("does not match a reauth cause without the CLI login remediation", () => {
        // The remediation command is the precise half of the signal; a cause
        // phrase alone (no `databricks auth login`) stays on the report path.
        expect(isReauthRequiredError("the refresh token is invalid")).to.be
            .false;
    });

    it("is safe on empty and non-string input", () => {
        expect(isReauthRequiredError("")).to.be.false;
        expect(isReauthRequiredError(undefined as unknown as string)).to.be
            .false;
    });
});
