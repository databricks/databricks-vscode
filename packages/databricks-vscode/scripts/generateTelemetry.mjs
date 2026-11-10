// The documentation of every telemetry event and its properties, in the old
// extension's format. VS Code's `code --telemetry` reads it from
// `telemetry.json` in the extension's folder, so packageVsix.mjs puts it in
// the VSIX; it isn't committed. `generate:telemetry` writes a copy to
// packages/databricks-vscode/telemetry.json (gitignored), to read.
//
// It reads the compiled definitions, so run `yarn build` first. It loads only
// `kernel/telemetry/`'s `schema`, `definitions` and `events`, and the
// features' `telemetry` modules (listed by src/kernel/telemetry/schema.ts),
// none of which imports `vscode`; `manifest.test.ts` checks those modules
// hold exactly the events the features declare.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** `telemetry.json`'s content, from the build in `dist`. */
export function telemetryJson(dist = path.join(packageDir, "dist")) {
    const { telemetryModuleFiles, telemetrySchema } = require(
        path.join(dist, "kernel/telemetry/schema.js"),
    );
    const modules = telemetryModuleFiles(dist, ".js").map((file) => require(file));
    return JSON.stringify(telemetrySchema(modules), null, 2) + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    fs.writeFileSync(path.join(packageDir, "telemetry.json"), telemetryJson(), "utf8");
}
