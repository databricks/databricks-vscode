// `yarn release:version <x.y.z>`: the version bump of a release pull request.
// It sets the version of the extension and of its types package, as 2.x's
// release pull requests do, and renames the extension CHANGELOG's
// `# Unreleased` section to `# Release: v<x.y.z>`, the heading the release
// notes are read from. The next change with notes starts a new
// `# Unreleased` above it. It checks everything before it writes anything.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The packages that carry the release's version; the first one's version is the current release. */
const VERSIONED = ["packages/databricks-vscode", "packages/databricks-vscode-types"];
const CHANGELOG = "packages/databricks-vscode/CHANGELOG.md";
const UNRELEASED = "# Unreleased\n";

/** Major, minor and patch, or undefined for anything else: the Marketplace takes no suffixes. */
function parse(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
    return match ? match.slice(1).map(Number) : undefined;
}

function isAbove(a, b) {
    const i = a.findIndex((part, j) => part !== b[j]);
    return i >= 0 && a[i] > b[i];
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function releaseVersion(version, dir = repoDir) {
    const next = parse(version);
    if (next === undefined) {
        throw new Error(`${version} isn't a release version: use x.y.z, with no suffix`);
    }
    const manifests = VERSIONED.map((p) => path.join(dir, p, "package.json"));
    const current = readJson(manifests[0]).version;
    const currentParts = parse(current);
    if (currentParts === undefined) {
        throw new Error(`${VERSIONED[0]} has the version ${current}, which isn't x.y.z`);
    }
    if (!isAbove(next, currentParts)) {
        throw new Error(`${version} isn't above the current version, ${current}`);
    }
    const changelogFile = path.join(dir, CHANGELOG);
    const changelog = fs.readFileSync(changelogFile, "utf8");
    // The section runs to the next top-level heading, an earlier release's.
    const notes = changelog.startsWith(UNRELEASED)
        ? changelog.slice(UNRELEASED.length).split(/^# /m)[0]
        : "";
    if (notes.trim() === "") {
        throw new Error(`${CHANGELOG} has no "# Unreleased" notes at the top to release`);
    }

    for (const file of manifests) {
        const manifest = readJson(file);
        manifest.version = version;
        fs.writeFileSync(file, `${JSON.stringify(manifest, null, 4)}\n`);
    }
    fs.writeFileSync(
        changelogFile,
        `# Release: v${version}\n${changelog.slice(UNRELEASED.length)}`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [version] = process.argv.slice(2);
    try {
        releaseVersion(version);
        console.log(
            `Set ${VERSIONED.join(" and ")} to ${version}, and released ${CHANGELOG}'s notes.`,
        );
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
