import {expect} from "chai";
import {parsePyvenvPrompt} from "./venvProjectName";

describe("parsePyvenvPrompt", () => {
    const pyvenvCfg = (prompt: string) =>
        [
            "home = /usr/bin",
            "implementation = CPython",
            "version_info = 3.12",
            "include-system-site-packages = false",
            `prompt = ${prompt}`,
        ].join("\n");

    it("returns the prompt value uv wrote", () => {
        expect(parsePyvenvPrompt(pyvenvCfg("my-project"))).to.equal(
            "my-project"
        );
    });

    it("trims surrounding whitespace and tolerates CRLF line endings", () => {
        const contents = "version_info = 3.12\r\nprompt =   spaced-out  \r\n";
        expect(parsePyvenvPrompt(contents)).to.equal("spaced-out");
    });

    it("returns undefined when there is no prompt line", () => {
        expect(
            parsePyvenvPrompt("home = /usr/bin\nversion_info = 3.12")
        ).to.equal(undefined);
    });

    it("returns undefined when the prompt value is empty", () => {
        expect(parsePyvenvPrompt("prompt = ")).to.equal(undefined);
    });

    it("keeps names that contain spaces", () => {
        expect(parsePyvenvPrompt("prompt = My Data Project")).to.equal(
            "My Data Project"
        );
    });
});
