import {expect} from "chai";
import {
    formatElapsed,
    ProgressTimers,
    setupProgressMessage,
    setupProgressPhase,
    withElapsedProgress,
} from "./setupProgress";

describe("formatElapsed", () => {
    it("formats zero as 0:00", () => {
        expect(formatElapsed(0)).to.equal("0:00");
    });

    it("zero-pads seconds", () => {
        expect(formatElapsed(1000)).to.equal("0:01");
        expect(formatElapsed(9000)).to.equal("0:09");
    });

    it("rolls seconds into minutes", () => {
        expect(formatElapsed(61000)).to.equal("1:01");
        expect(formatElapsed(125000)).to.equal("2:05");
        expect(formatElapsed(600000)).to.equal("10:00");
    });

    it("truncates sub-second remainder", () => {
        expect(formatElapsed(1999)).to.equal("0:01");
    });

    it("clamps negative input to 0:00", () => {
        expect(formatElapsed(-5000)).to.equal("0:00");
    });

    it("clamps non-finite input to 0:00", () => {
        expect(formatElapsed(NaN)).to.equal("0:00");
        expect(formatElapsed(Infinity)).to.equal("0:00");
    });
});

describe("setupProgressPhase", () => {
    it("walks the fast leading phases in order", () => {
        expect(setupProgressPhase(0)).to.equal("Checking prerequisites…");
        expect(setupProgressPhase(1499)).to.equal("Checking prerequisites…");
        expect(setupProgressPhase(1500)).to.equal(
            "Resolving your Databricks compute…"
        );
        expect(setupProgressPhase(3000)).to.equal(
            "Fetching matching versions and constraints…"
        );
        expect(setupProgressPhase(4500)).to.equal("Updating pyproject.toml…");
        expect(setupProgressPhase(5999)).to.equal("Updating pyproject.toml…");
    });

    it("enters the provision loop after the leading phases", () => {
        expect(setupProgressPhase(6000)).to.equal(
            "Installing the matching Python version…"
        );
    });

    it("rotates the real provision sub-steps while provisioning", () => {
        expect(setupProgressPhase(12000)).to.equal(
            "Downloading databricks-connect and dependencies…"
        );
        expect(setupProgressPhase(18000)).to.equal(
            "Resolving and syncing packages with uv…"
        );
    });

    it("loops the provision sub-steps indefinitely", () => {
        // Same message as the first provision step, one full rotation later.
        expect(setupProgressPhase(24000)).to.equal(setupProgressPhase(6000));
        expect(setupProgressPhase(24000)).to.equal(
            "Installing the matching Python version…"
        );
    });

    it("clamps negative input to the first phase", () => {
        expect(setupProgressPhase(-1000)).to.equal("Checking prerequisites…");
    });

    it("clamps non-finite input to the first phase", () => {
        expect(setupProgressPhase(NaN)).to.equal("Checking prerequisites…");
    });
});

describe("setupProgressMessage", () => {
    it("appends the elapsed counter to the current phase", () => {
        expect(setupProgressMessage(0)).to.equal(
            "Checking prerequisites… (0:00)"
        );
        expect(setupProgressMessage(72000)).to.equal(
            "Resolving and syncing packages with uv… (1:12)"
        );
    });
});

/** A controllable clock + interval, so ticking and cleanup are deterministic. */
function fakeTimers() {
    let now = 0;
    const intervals: {cb: () => void; cleared: boolean}[] = [];
    const timers: ProgressTimers = {
        now: () => now,
        setInterval: (cb) => {
            const handle = {cb, cleared: false};
            intervals.push(handle);
            return handle;
        },
        clearInterval: (handle) => {
            (handle as {cleared: boolean}).cleared = true;
        },
    };
    return {
        timers,
        setNow: (value: number) => (now = value),
        tick: () => intervals.forEach((h) => !h.cleared && h.cb()),
        started: () => intervals.length,
        allCleared: () => intervals.every((h) => h.cleared),
    };
}

describe("withElapsedProgress", () => {
    it("reports the opening line synchronously", () => {
        const messages: string[] = [];
        void withElapsedProgress(
            {report: (v) => messages.push(v.message)},
            () => new Promise<void>(() => {}), // never settles
            fakeTimers().timers
        );
        expect(messages).to.deep.equal(["Checking prerequisites… (0:00)"]);
    });

    it("re-reports the current phase and elapsed on each tick", async () => {
        const fake = fakeTimers();
        const messages: string[] = [];
        let finish!: (v: string) => void;
        const done = withElapsedProgress(
            {report: (v) => messages.push(v.message)},
            () => new Promise<string>((res) => (finish = res)),
            fake.timers
        );

        // `work` is deferred one microtask (Promise.resolve().then), so let it
        // start before driving the clock and settling it.
        await Promise.resolve();
        fake.setNow(7000);
        fake.tick();
        finish("ok");
        await done;

        expect(messages[0]).to.equal("Checking prerequisites… (0:00)");
        expect(messages[1]).to.equal(setupProgressMessage(7000));
    });

    it("resolves with the work's value and stops the ticker", async () => {
        const fake = fakeTimers();
        const result = await withElapsedProgress(
            {report: () => {}},
            async () => "done",
            fake.timers
        );
        expect(result).to.equal("done");
        expect(fake.allCleared()).to.equal(true);
    });

    it("stops the ticker when the work rejects", async () => {
        const fake = fakeTimers();
        const err = await withElapsedProgress(
            {report: () => {}},
            async () => {
                throw new Error("boom");
            },
            fake.timers
        ).catch((e) => e as Error);
        expect((err as Error).message).to.equal("boom");
        expect(fake.allCleared()).to.equal(true);
    });

    it("stops the ticker when the work throws synchronously", async () => {
        const fake = fakeTimers();
        await withElapsedProgress(
            {report: () => {}},
            () => {
                throw new Error("sync");
            },
            fake.timers
        ).catch(() => {});
        expect(fake.started()).to.equal(1);
        expect(fake.allCleared()).to.equal(true);
    });
});
