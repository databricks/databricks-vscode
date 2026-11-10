// Downloads the Databricks CLI that package.json pins (`cli.version`) into
// bin/, checking its SHA-256 against the release's checksums. A Node port of
// the old scripts/fetch-databricks-cli.sh, without jq, curl or unzip.
//
//   node --use-system-ca scripts/fetchCli.mjs [<os>_<arch>] [<destination dir>]
//
// Does nothing when bin/ already holds the pinned version.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")).cli
    .version;

const osNames = { darwin: "darwin", linux: "linux", win32: "windows" };
const archNames = { x64: "amd64", arm64: "arm64", ia32: "386" };
const target = process.argv[2] ?? `${osNames[process.platform]}_${archNames[process.arch]}`;
const destDir = path.resolve(process.argv[3] ?? path.join(packageDir, "bin"));
const binName = target.startsWith("windows") ? "databricks.exe" : "databricks";
const binPath = path.join(destDir, binName);

function installedVersion() {
    try {
        const out = execFileSync(binPath, ["version", "--output", "json"], {
            stdio: ["ignore", "pipe", "ignore"],
        });
        return JSON.parse(out.toString()).Version;
    } catch {
        return undefined;
    }
}

async function download(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`GET ${url}: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

/** Reads one stored or deflated entry from a zip, through its central directory. */
function unzipEntry(zip, name) {
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) {
        throw new Error("Not a zip file");
    }
    const entries = zip.readUInt16LE(eocd + 10);
    let offset = zip.readUInt32LE(eocd + 16);
    for (let i = 0; i < entries; i++) {
        const method = zip.readUInt16LE(offset + 10);
        const compressedSize = zip.readUInt32LE(offset + 20);
        const nameLength = zip.readUInt16LE(offset + 28);
        const extraLength = zip.readUInt16LE(offset + 30);
        const commentLength = zip.readUInt16LE(offset + 32);
        const localOffset = zip.readUInt32LE(offset + 42);
        const entryName = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
        if (entryName === name) {
            const dataStart =
                localOffset +
                30 +
                zip.readUInt16LE(localOffset + 26) +
                zip.readUInt16LE(localOffset + 28);
            const data = zip.subarray(dataStart, dataStart + compressedSize);
            if (method === 0) {
                return data;
            }
            if (method === 8) {
                return zlib.inflateRawSync(data);
            }
            throw new Error(`Unsupported zip compression method ${method}`);
        }
        offset += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error(`${name} is not in the archive`);
}

if (installedVersion() === version) {
    console.log(`bin/${binName} is already v${version}`);
} else {
    const base = `https://github.com/databricks/cli/releases/download/v${version}`;
    const archive = `databricks_cli_${version}_${target}.zip`;
    console.log(`Downloading ${base}/${archive}`);
    const [zip, sums] = await Promise.all([
        download(`${base}/${archive}`),
        download(`${base}/databricks_cli_${version}_SHA256SUMS`),
    ]);
    const expected = sums
        .toString()
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .find(([, file]) => file === archive)?.[0];
    const actual = crypto.createHash("sha256").update(zip).digest("hex");
    if (expected === undefined || expected !== actual) {
        throw new Error(`Checksum mismatch for ${archive}: expected ${expected}, got ${actual}`);
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.rmSync(binPath, { force: true });
    fs.writeFileSync(binPath, unzipEntry(zip, binName), { mode: 0o755 });
    console.log(
        `Installed ${path.relative(packageDir, binPath)} v${installedVersion() ?? version}`,
    );
}
