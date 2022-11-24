import fs from "node:fs/promises";
import {argv} from "node:process";

async function main() {
    const rawData = await fs.readFile(argv[2], {
        encoding: "utf-8",
    });

    const jsonData = JSON.parse(rawData);
    jsonData["arch"] = {
        bricksArch: argv[3],
        vsixArch: argv[4],
    };

    await fs.writeFile(argv[2], JSON.stringify(jsonData), {
        encoding: "utf-8",
    });
}

main();
