/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {Subject} from "./Subject";

describe(__filename, () => {
    it("should notify", async () => {
        const subject = new Subject();

        let called = 0;

        subject.wait().then(() => {
            called += 1;
        });

        assert(!called);
        subject.notify();

        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(called, 1);
    });

    it("whould resolve once even if notified multiple times", async () => {
        const subject = new Subject();

        let called = 0;

        subject.wait().then(() => {
            called += 1;
        });

        assert(!called);
        subject.notify();
        subject.notify();
        subject.notify();

        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(called, 1);
    });

    it("whould reject on timeout", async () => {
        const subject = new Subject();
        assert.rejects(subject.wait(100));
    });
});
