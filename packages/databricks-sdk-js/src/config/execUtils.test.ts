import * as assert from "node:assert";
import {execFileWithShell, FileNotFoundException} from "./execUtils";

describe(__filename, () => {
    it("should spawn a command", async () => {
        const {stdout} = await execFileWithShell("echo", ["hello"]);
        assert.match(stdout, /^hello\r?\n$/m);
    });

    it("should detect if the command is not found", async () => {
        await assert.rejects(
            execFileWithShell("i_dont_exist", []),
            FileNotFoundException
        );
    });
});
