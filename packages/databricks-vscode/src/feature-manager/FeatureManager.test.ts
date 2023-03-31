import {spy, verify} from "ts-mockito";
import {FeatureManager} from "./FeatureManager";
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
        this.runSteps({check1: this.check1, check2: this.check2});
    }
}
describe(__filename, async () => {
    it("should cache enablement value", async () => {
        const testVerifier = new TestAccessVerifier();
        const fm = new FeatureManager<"test">([]);
        const spyTestVerifier = spy(testVerifier);
        fm.registerFeature("test", testVerifier);

        assert.ok(!(await fm.isEnabled("test")).avaliable);
        assert.ok(!(await fm.isEnabled("test")).avaliable);
        verify(spyTestVerifier.check()).once();
        verify(spyTestVerifier.check1()).once();
        verify(spyTestVerifier.check2()).never();
    });

    it("should update cached value", async () => {
        const testVerifier = new TestAccessVerifier();
        const fm = new FeatureManager<"test">([]);
        const spyTestVerifier = spy(testVerifier);
        fm.registerFeature("test", testVerifier);

        //check value is picked from cache
        assert.ok(!(await fm.isEnabled("test")).avaliable);
        assert.ok(!(await fm.isEnabled("test")).avaliable);
        verify(spyTestVerifier.check()).once();
        verify(spyTestVerifier.check1()).once();
        verify(spyTestVerifier.check2()).never();

        //cache should be true only when both values are true
        assert.ok(await testVerifier.check1(true));
        assert.ok(!(await fm.isEnabled("test")).avaliable);
        assert.ok(await testVerifier.check2(true));
        assert.ok((await fm.isEnabled("test")).avaliable);

        //cache should be false if even 1 value is false
        assert.ok(!(await testVerifier.check2(false)));
        assert.ok(!(await fm.isEnabled("test")).avaliable);
        assert.ok((await fm.isEnabled("test")).reason === "reason2");

        //cache should be  reset to true if both values are true
        assert.ok(await testVerifier.check2(true));
        assert.ok((await fm.isEnabled("test")).avaliable);
    });

    it("disabled features should always return false", async () => {
        const testVerifier = new TestAccessVerifier();
        const fm = new FeatureManager<"test">(["test"]);
        const spyTestVerifier = spy(testVerifier);
        fm.registerFeature("test", testVerifier);

        assert.ok(!(await fm.isEnabled("test")).avaliable);
        assert.ok(!(await fm.isEnabled("test")).avaliable);
        verify(spyTestVerifier.check()).never();
        verify(spyTestVerifier.check1()).never();
        verify(spyTestVerifier.check2()).never();

        assert.ok((await fm.isEnabled("test")).reason === "Feature disabled");
    });
});
