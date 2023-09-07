const fs = require("fs/promises");

const header = `Copyright (2022) Databricks, Inc.

This Software includes software developed at Databricks (https://www.databricks.com/) and its use is subject to the included LICENSE file.
***
This Software contains code from the following open source projects:

`;

async function* crawlLicenses(start) {
    try {
        const stat = await fs.stat(start);
        if (!stat.isDirectory()) {
            return;
        }
    } catch (e) {
        return;
    }

    for (const folder of await fs.readdir(start)) {
        if (folder.startsWith(".")) {
            continue;
        }
        if (folder === "databricks" || folder.startsWith("@databricks")) {
            continue;
        }
        if (folder.startsWith("@")) {
            yield* crawlLicenses(start + "/" + folder);
            continue;
        }

        const path = start + "/" + folder;

        try {
            const link = await fs.readlink(path);
            if (link === ".." || link === "../..") {
                continue;
            }
        } catch (e) {}

        const pkg = JSON.parse(
            await fs.readFile(path + "/package.json", "utf8")
        );
        yield {
            name: pkg.name,
            version: pkg.version,
            license: pkg.license,
            repository: pkg.repository.url || pkg.repository,
        };
        yield* crawlLicenses(path + "/node_modules");
    }
}

async function main() {
    let notice =
        header +
        `| Name             | Installed version | License | Code                                                 |
| :--------------- | :---------------- | :----------- | :--------------------------------------------------- |\n`;

    let deps = {};
    for await (let dep of crawlLicenses(process.cwd() + "/node_modules")) {
        deps[dep.name + "@" + dep.version] = dep;
    }
    const depNames = Object.keys(deps).sort();

    for (let depName of depNames) {
        const dep = deps[depName];
        if (dep.name.startsWith("@databricks")) {
            continue;
        }
        notice += `| [${dep.name}](https://www.npmjs.com/package/${dep.name}) | ${dep.version} | ${dep.license} | ${dep.repository} |\n`;
    }
    // eslint-disable-next-line no-console
    console.log(notice);
}

main();
