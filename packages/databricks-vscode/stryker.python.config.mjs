// Mutation testing of the files in src/features/python/ that import nothing
// from "vscode", not even types (`yarn workspace databricks
// mutation:python`). See stryker.config.mjs.
import fs from "node:fs";
import { strykerConfig } from "./stryker.config.mjs";

const importsVscode =
    /\bfrom\s+"vscode"|\bimport\s*\(\s*"vscode"\s*\)|\brequire\s*\(\s*"vscode"\s*\)/;

const mutate = fs
    .globSync("src/features/python/**/*.ts")
    .filter((file) => !file.endsWith(".test.ts") && !file.includes("/fixtures/"))
    .filter((file) => !importsVscode.test(fs.readFileSync(file, "utf8")))
    .toSorted();

export default strykerConfig("python", mutate);
