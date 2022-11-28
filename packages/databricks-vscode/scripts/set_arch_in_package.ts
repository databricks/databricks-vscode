import fs from "node:fs/promises";
import yargs from "yargs";

async function main() {
    const argv = await yargs
        .option("bricksArch", {
            alias: "b",
            description: "Architecture of bricks-cli.",
            type: "string",
            requiresArg: true,
        })
        .option("vsixArch", {
            alias: "V",
            description: "Architecture of vsix",
            type: "string",
            requiresArg: true,
        })
        .option("commitSha", {
            alias: "c",
            description:
                "Commit sha of the commit from which this build is created.",
            type: "string",
            requiresArg: true,
        })
        .option("packageFile", {
            alias: "f",
            description: "path/to/package.json",
            type: "string",
            requiresArg: true,
        }).argv;

    const rawData = await fs.readFile(argv.packageFile!, {
        encoding: "utf-8",
    });
    const jsonData = JSON.parse(rawData);

    jsonData["arch"] = {
        bricksArch: argv.bricksArch,
        vsixArch: argv.vsixArch,
    };
    jsonData["commitSha"] = argv.commitSha;

    await fs.writeFile(argv.packageFile!, JSON.stringify(jsonData), {
        encoding: "utf-8",
    });
}

main();
