import {glob} from "glob";
import path from "path";

function toUnixPath(path: string) {
    if (process.platform === "win32") {
        return path.replace(/\\/g, "/");
    }
    return path;
}

const integrationTests = glob
    .globSync(
        toUnixPath(
            path.join(process.cwd(), "src", "test", "e2e", "**", "*.e2e.ts")
        ),
        {
            nocase: process.platform === "win32",
        }
    )
    .filter(
        (testPath) =>
            process.env.TEST_SSH_E2E === "true" ||
            path.basename(testPath) !== "ssh_connection.ucws.e2e.ts"
    )
    .map((testPath) => {
        return {
            path: toUnixPath(path.relative(process.cwd(), testPath)),
            baseName: path.basename(testPath, ".e2e.ts"),
            ucws: testPath.includes(".ucws.") ? true : false,
        };
    });

// eslint-disable-next-line no-console
console.log(JSON.stringify(integrationTests));
