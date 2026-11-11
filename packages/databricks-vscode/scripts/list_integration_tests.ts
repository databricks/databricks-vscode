// Prints the integration-test CI's matrix, a JSON array with one entry per e2e spec
// (scripts/integration/lib.mjs at the repo root). The CI runs
// `yarn ts-node scripts/list_integration_tests.ts` in this package; `ts-node` is this package's
// script for `node`, which runs this file by stripping its types (Node 22.18 or later).
import path from "node:path";
import { integrationSpecs } from "../../../scripts/integration/lib.mjs";

const packageDir = path.resolve(import.meta.dirname, "..");
const specDir = path.join(packageDir, "..", "databricks-vscode-e2e", "src");
console.log(JSON.stringify(integrationSpecs(specDir, packageDir, process.env)));
