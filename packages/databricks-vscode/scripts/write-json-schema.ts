import * as fs from "fs";
import {compileFromFile} from "json-schema-to-typescript";

// compile from file
compileFromFile("./bundle_schema.json").then((ts) =>
    fs.writeFileSync("foo.d.ts", ts)
);
