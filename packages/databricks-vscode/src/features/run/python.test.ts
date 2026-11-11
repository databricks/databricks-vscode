import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TESTS = path.resolve(__dirname, "../../../resources/python/tests");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

// `resources/python/tests`: how `bootstrap.py` reads its JSON arguments, the file wrapper, how
// `dbconnect-bootstrap.py` and the IPython startup script apply the env file (a golden shared with
// `EnvFile.test.ts`), in folders with spaces, and the startup script's magics and `%sql` splitter.
describe("the Python bootstraps", () => {
    // Starting Python and its 47 tests took over vitest's 5 s default on a Windows runner.
    it.skipIf(python === undefined)("pass their unittest suite", { timeout: 60_000 }, () => {
        const result = spawnSync(python!, ["-m", "unittest", "discover", "-s", TESTS, "-v"], {
            encoding: "utf-8",
        });
        // unittest ends with OK, and on Windows its lines with \r\n.
        expect(result.stderr).toMatch(/\r?\nOK(\r?\n)?$/);
        expect(result.status).toBe(0);
    });
});
