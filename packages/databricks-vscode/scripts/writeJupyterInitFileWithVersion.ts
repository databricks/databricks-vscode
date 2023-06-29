import {cpSync} from "node:fs";
import {jupyterInitScriptVersion} from "../package.json";
import path from "node:path";

const pythonDir = path.resolve(__dirname, "..", "resources", "python");
cpSync(
    path.join(pythonDir, "00-databricks-init.py"),
    path.join(
        pythonDir,
        "generated",
        `00-databricks-init-${jupyterInitScriptVersion}.py`
    )
);
