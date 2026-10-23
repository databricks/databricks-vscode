import {expect} from "chai";
import path from "node:path";
import {containsPath} from "./containsPath";

describe("containsPath", () => {
    const root = path.resolve("/mono");

    it("contains the folder itself and paths inside it", () => {
        expect(containsPath(root, root)).to.equal(true);
        expect(containsPath(root, path.join(root, "a", "b"))).to.equal(true);
    });

    it("contains a name that starts with two dots", () => {
        expect(containsPath(root, path.join(root, "..cache.bak"))).to.equal(
            true
        );
    });

    it("does not contain the parent, a sibling, or another root", () => {
        expect(containsPath(root, path.dirname(root))).to.equal(false);
        expect(containsPath(root, path.resolve("/mono-2/x"))).to.equal(false);
        expect(containsPath(root, path.join(root, "..", "x"))).to.equal(false);
    });
});
