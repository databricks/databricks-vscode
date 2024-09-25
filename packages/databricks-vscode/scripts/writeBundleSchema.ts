/**
 * This script generates the BundleSchema.ts file from the bundle schema.
 * It MUST be run after a yarn package:cli:fetch
 */

import * as cp from "child_process";
import * as fs from "fs";
import {
    quicktype,
    InputData,
    JSONSchemaInput,
    FetchingJSONSchemaStore,
} from "quicktype-core";
import {argv} from "process";

const output = cp.execFileSync(argv[2], ["bundle", "schema"]);

async function quicktypeJSONSchema(
    targetLanguage: string,
    typeName: string,
    jsonSchemaString: string
) {
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());
    await schemaInput.addSource({name: typeName, schema: jsonSchemaString});
    const inputData = new InputData();
    inputData.addInput(schemaInput);
    const result = await quicktype({
        inputData,
        lang: targetLanguage,
    });
    fs.writeFileSync(
        argv[3],
        "/* eslint-disable */\n" + result.lines.join("\n")
    );
    // eslint-disable-next-line no-console
    console.log("BundleSchema.d.ts written to", argv[3]);
}

quicktypeJSONSchema("typescript", "BundleSchema", output.toString());
