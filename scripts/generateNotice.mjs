// `yarn generate:notice`: writes packages/databricks-vscode/NOTICE.md, the
// notices for the production dependencies that ship in the VSIX, in the table
// 2.x's generator wrote. Databricks' own packages are left out, as in 2.x. The
// release pull request runs it (.github/workflows/release-pr.yml).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productionDependencies } from "../packages/databricks-vscode/scripts/packageVsix.mjs";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(repoDir, "packages", "databricks-vscode");

const HEADER = `Copyright (2022) Databricks, Inc.

This Software includes software developed at Databricks (https://www.databricks.com/) and its use is subject to the included LICENSE file.

---

This Software contains code from the following open source projects:

| Name | Installed version | License | Code |
| :--- | :---------------- | :------ | :--- |
`;

/** A manifest's licence: the SPDX string, or the old `{type}` and `licenses` forms. */
export function licenseOf(manifest) {
    if (typeof manifest.license === "string") {
        return manifest.license;
    }
    if (manifest.license?.type) {
        return manifest.license.type;
    }
    if (Array.isArray(manifest.licenses)) {
        return manifest.licenses.map((l) => l.type ?? l).join(" OR ");
    }
    return "";
}

/** A manifest's `repository`, which is a string, an object with a `url`, or missing. */
export function repositoryOf(manifest) {
    const repository = manifest.repository;
    return typeof repository === "string" ? repository : (repository?.url ?? "");
}

/** NOTICE.md for these manifests: one row per name and version, sorted, without Databricks' own packages. */
export function noticeFor(manifests) {
    const rows = new Map();
    for (const manifest of manifests) {
        if (manifest.name.startsWith("@databricks/")) {
            continue;
        }
        rows.set(
            `${manifest.name}@${manifest.version}`,
            `| [${manifest.name}](https://www.npmjs.com/package/${manifest.name}) | ${manifest.version} | ${licenseOf(manifest)} | ${repositoryOf(manifest)} |`,
        );
    }
    // Code-unit order, as 2.x's generator sorted, so the file doesn't depend on the locale.
    const keys = [...rows.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return HEADER + keys.map((key) => rows.get(key)).join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const manifests = productionDependencies(packageDir).map(({ source }) =>
        JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")),
    );
    const out = path.join(packageDir, "NOTICE.md");
    fs.writeFileSync(out, noticeFor(manifests));
    console.log(
        `Wrote ${path.relative(repoDir, out)}: ${manifests.length} production dependencies.`,
    );
}
