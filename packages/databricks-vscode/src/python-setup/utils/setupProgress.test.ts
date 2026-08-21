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
        expect(setupProgressPhase(0)).to.equal("checking prerequisites…");
        expect(setupProgressPhase(3499)).to.equal("checking prerequisites…");
        expect(setupProgressPhase(3500)).to.equal(
            "resolving your Databricks compute…"
        );
        expect(setupProgressPhase(7000)).to.equal(
            "fetching matching versions and constraints…"
        );
        expect(setupProgressPhase(10500)).to.equal("updating pyproject.toml…");
        expect(setupProgressPhase(13999)).to.equal("updating pyproject.toml…");
    });

    it("enters the provision loop after the leading phases", () => {
        expect(setupProgressPhase(14000)).to.equal(
            "installing the matching Python version…"
        );
    });

    it("rotates the real provision sub-steps while provisioning", () => {
        expect(setupProgressPhase(20000)).to.equal(
            "creating the virtual environment…"
        );
        expect(setupProgressPhase(26000)).to.equal(
            "resolving the dependency graph…"
        );
        expect(setupProgressPhase(32000)).to.equal(
            "downloading databricks-connect and dependencies…"
        );
    });

    it("loops the provision sub-steps indefinitely", () => {
        // Same message as the first provision step, one full rotation (six
        // 6s steps = 36s) later.
        expect(setupProgressPhase(50000)).to.equal(setupProgressPhase(14000));
        expect(setupProgressPhase(50000)).to.equal(
            "installing the matching Python version…"
        );
    });

    it("clamps negative input to the first phase", () => {
        expect(setupProgressPhase(-1000)).to.equal("checking prerequisites…");
    });

    it("clamps non-finite input to the first phase", () => {
        expect(setupProgressPhase(NaN)).to.equal("checking prerequisites…");
    });
});

describe("setupProgressMessage", () => {
    it("appends the elapsed counter to the current phase", () => {
        expect(setupProgressMessage(0)).to.equal(
            "checking prerequisites… (0:00)"
        );
        expect(setupProgressMessage(72000)).to.equal(
            "downloading databricks-connect and dependencies… (1:12)"
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
        expect(messages).to.deep.equal(["checking prerequisites… (0:00)"]);
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

        expect(messages[0]).to.equal("checking prerequisites… (0:00)");
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
