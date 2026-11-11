// Run before `stryker run` (package.json `mutation*` scripts). Stryker's
// sandboxes are in <root>/.stryker-tmp/sandbox-*/ (stryker.config.mjs), and
// manifest.test.ts reads the e2e specs from the package's sibling
// (`<package>/../databricks-vscode-e2e/src`), so link that sibling there.
import fs from "node:fs";

const link = new URL("../../../.stryker-tmp/databricks-vscode-e2e", import.meta.url);
if (!fs.existsSync(link)) {
    fs.mkdirSync(new URL(".", link), { recursive: true });
    fs.symlinkSync("../packages/databricks-vscode-e2e", link);
}
