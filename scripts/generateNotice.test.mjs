import assert from "node:assert/strict";
import { test } from "node:test";
import { licenseOf, noticeFor, repositoryOf } from "./generateNotice.mjs";

const rows = (notice) => notice.split("\n").filter((line) => line.startsWith("| ["));

await test("noticeFor", async (t) => {
    await t.test("lists each package once, sorted by name and version", () => {
        const notice = noticeFor([
            { name: "zod", version: "4.1.0", license: "MIT", repository: "colinhacks/zod" },
            {
                name: "ansi-to-html",
                version: "0.7.2",
                license: "MIT",
                repository: "rburns/ansi-to-html",
            },
            { name: "zod", version: "4.1.0", license: "MIT", repository: "colinhacks/zod" },
            { name: "zod", version: "3.25.0", license: "MIT", repository: "colinhacks/zod" },
        ]);
        assert.deepEqual(rows(notice), [
            "| [ansi-to-html](https://www.npmjs.com/package/ansi-to-html) | 0.7.2 | MIT | rburns/ansi-to-html |",
            "| [zod](https://www.npmjs.com/package/zod) | 3.25.0 | MIT | colinhacks/zod |",
            "| [zod](https://www.npmjs.com/package/zod) | 4.1.0 | MIT | colinhacks/zod |",
        ]);
    });

    await t.test("sorts by code unit, not by the locale", () => {
        const notice = noticeFor([
            { name: "abc", version: "1.0.0", license: "MIT" },
            { name: "JSONStream", version: "1.3.5", license: "MIT" },
            { name: "@azure/core-util", version: "1.13.0", license: "MIT" },
        ]);
        // localeCompare would put "abc" before "JSONStream".
        assert.deepEqual(
            rows(notice).map((row) => row.slice(3, row.indexOf("]"))),
            ["@azure/core-util", "JSONStream", "abc"],
        );
    });

    await t.test("leaves out Databricks' own packages, as 2.x does", () => {
        const notice = noticeFor([
            { name: "@databricks/sdk-core", version: "0.51.3", license: "Apache-2.0" },
            { name: "yaml", version: "2.9.1", license: "ISC", repository: "github:eemeli/yaml" },
        ]);
        assert.equal(rows(notice).length, 1);
        assert.match(rows(notice)[0], /^\| \[yaml\]/);
    });

    await t.test("starts with the copyright and the table's header", () => {
        const notice = noticeFor([]);
        assert.match(notice, /^Copyright \(2022\) Databricks, Inc\.\n/);
        assert.match(notice, /\| Name \| Installed version \| License \| Code \|\n/);
    });
});

await test("licenseOf", async (t) => {
    await t.test("reads the SPDX string, the old object form and the old array form", () => {
        assert.equal(licenseOf({ license: "MIT" }), "MIT");
        assert.equal(licenseOf({ license: { type: "BSD-3-Clause" } }), "BSD-3-Clause");
        assert.equal(
            licenseOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }),
            "MIT OR Apache-2.0",
        );
        assert.equal(licenseOf({}), "");
    });
});

await test("repositoryOf", async (t) => {
    await t.test("reads a string, an object's url, or nothing", () => {
        assert.equal(repositoryOf({ repository: "eemeli/yaml" }), "eemeli/yaml");
        assert.equal(
            repositoryOf({ repository: { type: "git", url: "https://github.com/a/b.git" } }),
            "https://github.com/a/b.git",
        );
        assert.equal(repositoryOf({}), "");
    });
});
