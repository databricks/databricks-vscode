import { describe, expect, it } from "vitest";
import { buildUserAgent } from "./userAgent";

describe("buildUserAgent", () => {
    it("names the auth type as the SDK does without credentials", () => {
        expect(buildUserAgent(undefined)).toMatch(/ auth\/default$/);
    });
});
