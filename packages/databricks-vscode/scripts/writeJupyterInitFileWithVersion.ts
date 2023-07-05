import {cpSync, readFileSync, rmSync, mkdirSync} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const pythonDir = path.resolve(__dirname, "..", "resources", "python");

const data = readFileSync(
    path.join(pythonDir, "00-databricks-init.py"),
    "utf-8"
);
const md5 = crypto.createHash("md5").update(data).digest("hex");
// eslint-disable-next-line no-console
console.log(md5);
rmSync(path.join(pythonDir, "generated", "databricks-init-scripts"), {
    force: true,
    recursive: true,
});
mkdirSync(path.join(pythonDir, "generated", "databricks-init-scripts"), {
    recursive: true,
});
cpSync(
    path.join(pythonDir, "00-databricks-init.py"),
    path.join(
        pythonDir,
        "generated",
        "databricks-init-scripts",
        `00-databricks-init-${md5}.py`
    )
);
