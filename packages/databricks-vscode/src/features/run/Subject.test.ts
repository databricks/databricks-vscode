import assert from "node:assert";
import { describe, it } from "vitest";
import { Subject } from "./Subject";

// Ported from the old `Subject.test.ts`; the timeout case now awaits its rejection.
describe("Subject", () => {
    it("should notify", async () => {
        const subject = new Subject();

        let called = 0;

        void subject.wait().then(() => {
            called += 1;
        });

        assert(!called);
        subject.notify();

        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(called, 1);
    });

    it("should resolve once even if notified multiple times", async () => {
        const subject = new Subject();

        let called = 0;

        void subject.wait().then(() => {
            called += 1;
        });

        assert(!called);
        subject.notify();
        subject.notify();
        subject.notify();

        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(called, 1);
    });

    it("should reject on timeout", async () => {
        const subject = new Subject();
        await assert.rejects(subject.wait(100));
    });
});
