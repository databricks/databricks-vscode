import {expect} from "chai";
import {venvInterpreterPath} from "./venvInterpreterPath";

describe("venvInterpreterPath", () => {
    it("uses Scripts\\python.exe on win32", () => {
        expect(venvInterpreterPath("C:\\p\\.venv", "win32")).to.equal(
            "C:\\p\\.venv\\Scripts\\python.exe"
        );
    });

    it("uses bin/python on linux", () => {
        expect(venvInterpreterPath("/p/.venv", "linux")).to.equal(
            "/p/.venv/bin/python"
        );
    });

    it("uses bin/python on darwin", () => {
        expect(venvInterpreterPath("/p/.venv", "darwin")).to.equal(
            "/p/.venv/bin/python"
        );
    });
});
