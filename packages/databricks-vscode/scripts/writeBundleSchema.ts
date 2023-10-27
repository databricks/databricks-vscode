/**
 * This script generates the BundleSchema.d.ts file from the bundle schema.
 * It MUST be run after a yarn package:cli:fetch
 */

import * as cp from "child_process";
import * as fs from "fs";
import {compileFromFile} from "json-schema-to-typescript";
import {tmpdir} from "os";
import path from "path";
import {argv} from "process";

const output = cp.execFileSync(argv[2], ["bundle", "schema"]);

const tmpFile = path.join(tmpdir(), "BundleSchema.json");
fs.writeFileSync(tmpFile, output);

// eslint-disable-next-line no-console
console.log("Bundle schema written to", tmpFile);

// compile from file
compileFromFile(tmpFile).then((ts) => fs.writeFileSync(argv[3], ts));

// eslint-disable-next-line no-console
console.log("BundleSchema.d.ts written to", argv[3]);
