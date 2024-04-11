import {glob} from "glob";
import path from "path";

const integrationTests = glob
    .sync(path.join(process.cwd(), "src", "test", "e2e", "**", "*.e2e.ts"), {
        nocase: process.platform === "win32",
    })
    .map((testPath) => {
        return {
            path: testPath,
            baseName: path.basename(testPath, ".e2e.ts"),
        };
    });

// eslint-disable-next-line no-console
console.log(JSON.stringify(integrationTests));
