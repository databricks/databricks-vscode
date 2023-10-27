import {expect} from "chai";
import {CachedValue} from "./CachedValue";
import {spy, instance, verify} from "ts-mockito";

describe(__filename, () => {
    let st: CachedValue<string>;
    class Getter {
        value: string = "test";
        get(): Promise<string> {
            return Promise.resolve(this.value);
        }
    }

    let getterSpy: Getter;

    beforeEach(() => {
        getterSpy = spy(new Getter());
        st = new CachedValue(instance(getterSpy).get);
    });

    it("should use getter to lazily fetch value initially", async () => {
        expect(await st.value).to.equal("test");
        verify(getterSpy.get()).once();
    });

    it("should use cached value if not dirty", async () => {
        expect(await st.value).to.equal("test");
        expect(await st.value).to.equal("test");
        verify(getterSpy.get()).once();
    });

    it("should use getter if dirty", async () => {
        expect(await st.value).to.equal("test");
        instance(getterSpy).value = "test2";
        verify(getterSpy.get()).once();

        await st.invalidate();
        expect(await st.value).to.equal("test2");
        verify(getterSpy.get()).twice();
    });
});
