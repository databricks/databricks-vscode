/* eslint-disable @typescript-eslint/naming-convention */
import {mkdir, readFile, writeFile} from "fs/promises";
import path from "path";
import yargs from "yargs";

interface INbCell {
    cell_type: string;
    source: string[];
    metadata: any;
    outputs: [];
    execution_count: null;
}

const nbCell: INbCell = {
    cell_type: "code",
    source: [],
    metadata: {},
    outputs: [],
    execution_count: null,
};

async function main() {
    const args = await yargs
        .option("srcFile", {
            alias: "s",
            description: "The source code to be wrapped into a notebook cell",
            type: "string",
            requiresArg: true,
        })
        .option("outFile", {
            alias: "o",
            type: "string",
            requiresArg: true,
        }).argv;
    const data = await readFile(args.srcFile!, "utf-8");
    nbCell.source = [data];

    await mkdir(path.dirname(args.outFile!), {recursive: true});
    await writeFile(args.outFile!, JSON.stringify(nbCell), "utf-8");
}

main();
