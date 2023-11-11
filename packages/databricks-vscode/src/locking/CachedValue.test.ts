import {expect} from "chai";
import {CachedValue} from "./CachedValue";

describe(__filename, () => {
    class GetterSpy {
        value: string = "test";
        callCount: number = 0;
        get(): Promise<string> {
            this.callCount += 1;
            return Promise.resolve(this.value);
        }
    }

    let getterSpy: GetterSpy;
    let st: CachedValue<string>;

    beforeEach(() => {
        getterSpy = new GetterSpy();
        st = new CachedValue(getterSpy.get.bind(getterSpy));
    });

    it("should use getter to lazily fetch value initially", async () => {
        expect(await st.value).to.equal("test");
        expect(getterSpy.callCount).to.equal(1);
    });

    it("should use cached value if not dirty", async () => {
        expect(await st.value).to.equal("test");
        expect(await st.value).to.equal("test");
        expect(getterSpy.callCount).to.equal(1);
    });

    it("should use getter if dirty", async () => {
        expect(await st.value).to.equal("test");
        getterSpy.value = "test2";
        expect(getterSpy.callCount).to.equal(1);

        await st.invalidate();
        expect(await st.value).to.equal("test2");
        expect(getterSpy.callCount).to.equal(2);
    });
});
