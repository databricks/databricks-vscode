import { describe, expect, it } from "vitest";
import { isCancellation } from "./errors";

describe("isCancellation", () => {
    it("treats a user's cancel as silent", () => {
        expect(isCancellation(new DOMException("aborted", "AbortError"))).toBe(true);
    });

    it("doesn't treat a timed-out call as cancelled, so its failure is shown", () => {
        expect(isCancellation(new DOMException("timed out", "TimeoutError"))).toBe(false);
    });
});
