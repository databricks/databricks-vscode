import fs from "node:fs/promises";
import {argv} from "node:process";

async function main() {
    const rawData = await fs.readFile(argv[2], {
        encoding: "utf-8",
    });

    const jsonData = JSON.parse(rawData);
    // eslint-disable-next-line no-console
    console.log(jsonData["arch"]);
    jsonData["arch"] = {
        bricksArch: argv[3],
        vsixArch: argv[4],
    };
    // eslint-disable-next-line no-console
    console.log(jsonData["arch"]);

    await fs.writeFile(argv[2], JSON.stringify(jsonData), {
        encoding: "utf-8",
    });
}

main();
