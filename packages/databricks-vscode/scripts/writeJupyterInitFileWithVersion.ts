import {cpSync, readFileSync} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const pythonDir = path.resolve(__dirname, "..", "resources", "python");

const data = readFileSync(
    path.join(pythonDir, "00-databricks-init.py"),
    "utf-8"
);
const md5 = crypto.createHash("md5").update(data).digest("base64");

cpSync(
    path.join(pythonDir, "00-databricks-init.py"),
    path.join(pythonDir, "generated", `00-databricks-init-${md5}.py`)
);
