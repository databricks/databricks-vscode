import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { releaseVersion } from "./releaseVersion.mjs";

const EXTENSION = "packages/databricks-vscode/package.json";
const TYPES = "packages/databricks-vscode-types/package.json";
const CHANGELOG = "packages/databricks-vscode/CHANGELOG.md";
const NOTES = "# Unreleased\n\n## packages/databricks-vscode\n\n- A change.\n";

/** A repo with the two manifests, formatted as the real ones are, and a CHANGELOG. */
function repo({ version = "0.0.0", changelog = NOTES } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-version-"));
    const files = {
        [EXTENSION]: {
            name: "databricks",
            version,
            engines: { vscode: "^1.128.0" },
            cli: { version: "1.22.1" },
        },
        [TYPES]: { name: "@databricks/databricks-vscode-types", version: "2.0.0" },
    };
    for (const [file, manifest] of Object.entries(files)) {
        fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), `${JSON.stringify(manifest, null, 4)}\n`);
    }
    fs.writeFileSync(path.join(dir, CHANGELOG), changelog);
    return dir;
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const snapshot = (dir) => [EXTENSION, TYPES, CHANGELOG].map((f) => read(dir, f));

await test("releaseVersion", async (t) => {
    await t.test("sets both packages' version, and nothing else in their manifests", () => {
        const dir = repo();
        releaseVersion("3.1.0", dir);
        assert.equal(
            read(dir, EXTENSION),
            `${JSON.stringify(
                {
                    name: "databricks",
                    version: "3.1.0",
                    engines: { vscode: "^1.128.0" },
                    cli: { version: "1.22.1" },
                },
                null,
                4,
            )}\n`,
        );
        assert.equal(JSON.parse(read(dir, TYPES)).version, "3.1.0");
    });

    await t.test(
        "renames the Unreleased section to the release's, and keeps earlier releases",
        () => {
            const earlier =
                "# Release: v3.1.0\n\n## packages/databricks-vscode\n\n- An older change.\n";
            const dir = repo({ version: "3.1.0", changelog: `${NOTES}\n${earlier}` });
            releaseVersion("3.1.1", dir);
            assert.equal(
                read(dir, CHANGELOG),
                `# Release: v3.1.1\n\n## packages/databricks-vscode\n\n- A change.\n\n${earlier}`,
            );
        },
    );

    await t.test("compares versions as numbers", () => {
        const dir = repo({ version: "3.9.0" });
        releaseVersion("3.10.0", dir);
        assert.equal(JSON.parse(read(dir, EXTENSION)).version, "3.10.0");
    });

    const refusals = [
        {
            what: "a version with a suffix",
            version: "3.1.0-rc1",
            message: /isn't a release version/,
        },
        { what: "a version without a patch", version: "3.1", message: /isn't a release version/ },
        { what: "a version with a v", version: "v3.1.0", message: /isn't a release version/ },
        { what: "no version", version: undefined, message: /isn't a release version/ },
        { what: "the current version", current: "3.1.0", version: "3.1.0", message: /isn't above/ },
        { what: "a lower version", current: "3.1.0", version: "3.0.9", message: /isn't above/ },
        {
            what: "a current version that isn't x.y.z",
            current: "3.0.0-bb1",
            version: "3.1.0",
            message: /has the version 3\.0\.0-bb1/,
        },
        {
            what: "a CHANGELOG without Unreleased at the top",
            version: "3.1.0",
            changelog: "# Release: v0.0.1\n\n- x\n",
            message: /no "# Unreleased" notes/,
        },
        {
            what: "an empty Unreleased section",
            version: "3.1.0",
            changelog: "# Unreleased\n\n# Release: v0.0.1\n\n- x\n",
            message: /no "# Unreleased" notes/,
        },
    ];
    for (const { what, current, version, changelog, message } of refusals) {
        await t.test(`refuses ${what}, and writes nothing`, () => {
            const dir = repo({ version: current, changelog });
            const before = snapshot(dir);
            assert.throws(() => releaseVersion(version, dir), message);
            assert.deepEqual(snapshot(dir), before);
        });
    }
});
