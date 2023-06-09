import path from "path";
import Mocha from "mocha";
import {glob} from "glob";

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "bdd",
        color: true,
    });

    // Add files to the test suite
    const testsRoot = path.resolve(__dirname, "..");
    const files = await glob("**/**.test.js", {cwd: testsRoot});
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
