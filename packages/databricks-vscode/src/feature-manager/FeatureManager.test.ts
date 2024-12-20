import {spy, verify} from "ts-mockito";
import {FeatureManager, FeatureStepState} from "./FeatureManager";
import {MultiStepAccessVerifier} from "./MultiStepAccessVerfier";
import * as assert from "assert";
class TestAccessVerifier extends MultiStepAccessVerifier {
    constructor() {
        super(["check1", "check2"]);
    }
    async check1(accept = false) {
        if (accept) {
            return this.acceptStep("check1");
        } else {
            return this.rejectStep("check1", "reason1");
        }
    }
    async check2(accept = false) {
        if (accept) {
            return this.acceptStep("check2");
        } else {
            return this.rejectStep("check2", "reason2");
        }
    }

    async check(): Promise<void> {
        await this.check1();
        await this.check2();
    }
}

function isAvailable(state: FeatureStepState) {
    return state.available;
}

describe(__filename, async () => {
    it("should cache enablement value", async () => {
        const testVerifier = new TestAccessVerifier();
        const fm = new FeatureManager<"test">([]);
        const spyTestVerifier = spy(testVerifier);
        fm.registerFeature("test", () => testVerifier);

        assert.ok(!(await fm.isEnabled("test")).available);
        assert.ok(!(await fm.isEnabled("test")).available);
        verify(spyTestVerifier.check()).once();
        verify(spyTestVerifier.check1()).once();
        verify(spyTestVerifier.check2()).once();
    });

    it("should update cached value", async () => {
        const testVerifier = new TestAccessVerifier();
        const fm = new FeatureManager<"test">([]);
        const spyTestVerifier = spy(testVerifier);
        fm.registerFeature("test", () => testVerifier);

        //check value is picked from cache
        assert.ok(!(await fm.isEnabled("test")).available);
        assert.ok(!(await fm.isEnabled("test")).available);
        verify(spyTestVerifier.check()).once();
        verify(spyTestVerifier.check1()).once();
        verify(spyTestVerifier.check2()).once();

        //cache should be true only when both values are true
        assert.ok(isAvailable(await testVerifier.check1(true)));
        assert.ok(!(await fm.isEnabled("test")).available);
        assert.ok(isAvailable(await testVerifier.check2(true)));
        assert.ok((await fm.isEnabled("test")).available);

        //cache should be false if even 1 value is false
        assert.ok(!isAvailable(await testVerifier.check2(false)));
        assert.ok(!(await fm.isEnabled("test")).available);
        assert.strictEqual(
            (await fm.isEnabled("test")).steps.get("check2")?.title,
            "reason2"
        );

        //cache should be reset to true if both values are true
        assert.ok(isAvailable(await testVerifier.check2(true)));
        assert.ok((await fm.isEnabled("test")).available);
    });

    it("disabled features should always return false", async () => {
        const testVerifier = new TestAccessVerifier();
        const fm = new FeatureManager<"test">(["test"]);
        const spyTestVerifier = spy(testVerifier);
        fm.registerFeature("test", () => testVerifier);

        assert.ok(!(await fm.isEnabled("test")).available);
        assert.ok(!(await fm.isEnabled("test")).available);
        verify(spyTestVerifier.check()).never();
        verify(spyTestVerifier.check1()).never();
        verify(spyTestVerifier.check2()).never();

        assert.strictEqual(
            (await fm.isEnabled("test")).message,
            "Feature is disabled"
        );
    });
});
