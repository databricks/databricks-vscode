import path from "path";
import Mocha from "mocha";
import {glob} from "glob";

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "bdd",
        color: true,
        // Cold CI runners (AV scan + cold FS cache) push a test's first real
        // I/O past mocha's 2s default, flaking whichever spawn test the glob
        // happens to run first. 5s is the repo-wide floor; tests that spawn the
        // real CLI still set their own higher timeout (see CliWrapper.test.ts).
        timeout: 5000,
    });

    // Add files to the test suite
    const testsRoot = path.resolve(__dirname, "..");
    const files = await glob("**/**.test.js", {
        cwd: testsRoot,
    });
    files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

    return await new Promise((resolve, reject) => {
        try {
            // Run the mocha test
            mocha.run((failures) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            reject(err);
        }
    });
}
