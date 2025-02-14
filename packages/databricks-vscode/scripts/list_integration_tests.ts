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
    .map((testPath) => {
        return {
            path: toUnixPath(path.relative(process.cwd(), testPath)),
            baseName: path.basename(testPath, ".e2e.ts"),
            serverless: testPath.includes("serverless") ? true : false,
        };
    });

// eslint-disable-next-line no-console
console.log(JSON.stringify(integrationTests));
