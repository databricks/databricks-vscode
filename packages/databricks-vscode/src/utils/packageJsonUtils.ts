import fs from "node:fs/promises";
import {execFile as execFileCb} from "node:child_process";
import {promisify} from "node:util";
import {ExtensionContext, window} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import {isDevExtension} from "./developmentUtils";

const execFile = promisify(execFileCb);

type OsType = "windows" | "linux" | "macos";
type ArchType = "x64" | "arm64" | "x86_32";

interface ArchDetails {
    os?: OsType;
    arch?: ArchType;
}

// Possible values https://nodejs.org/api/process.html#processplatform
export const nodeOsMap: Map<string, OsType> = new Map([
    ["darwin", "macos"],
    ["linux", "linux"],
    ["win32", "windows"],
]);

// Possible values https://nodejs.org/api/process.html#processarch
export const nodeArchMap: Map<string, ArchType> = new Map([
    ["arm64", "arm64"],
    ["x64", "x64"],
    ["ia32", "x86_32"],
]);

const cliArchMap: Map<string, ArchDetails> = new Map([
    ["darwin_arm64", {os: "macos", arch: "arm64"}],
    ["darwin_amd64", {os: "macos", arch: "x64"}],
    ["linux_arm64", {os: "linux", arch: "arm64"}],
    ["linux_amd64", {os: "linux", arch: "x64"}],
    ["windows_arm64", {os: "windows", arch: "arm64"}],
    ["windows_amd64", {os: "windows", arch: "x64"}],
    ["windows_386", {os: "windows", arch: "x86_32"}],
]);

export const vsixArchMap: Map<string, ArchDetails> = new Map([
    ["darwin-arm64", {os: "macos", arch: "arm64"}],
    ["darwin-x64", {os: "macos", arch: "x64"}],
    ["linux-arm64", {os: "linux", arch: "arm64"}],
    ["linux-x64", {os: "linux", arch: "x64"}],
    ["win32-arm64", {os: "windows", arch: "arm64"}],
    ["win32-x64", {os: "windows", arch: "x64"}],
    ["win32-ia32", {os: "windows", arch: "x86_32"}],
]);

export interface PackageMetaData {
    packageName: string;
    version: string;
    cliArch?: string;
    vsixArch?: string;
    commitSha?: string;
    cliVersion?: string;
}

function getNodeArchDetails(): ArchDetails {
    return {
        os: nodeOsMap.get(process.platform),
        arch: nodeArchMap.get(process.arch),
    };
}

export function isEqual(l: ArchDetails, r: ArchDetails) {
    return l.os === r.os && l.arch === r.arch;
}

export async function getMetadata(
    context: ExtensionContext
): Promise<PackageMetaData> {
    const rawData = await fs.readFile(
        context.asAbsolutePath("./package.json"),
        {
            encoding: "utf-8",
        }
    );

    const jsonData = JSON.parse(rawData);
    return {
        packageName: jsonData["name"],
        version: jsonData["version"],
        cliArch: jsonData["arch"]?.["cliArch"],
        vsixArch: jsonData["arch"]?.["vsixArch"],
        commitSha: jsonData["commitSha"],
        cliVersion: jsonData["cli"]?.["version"],
    };
}

/**
 * Reads the version of the CLI binary bundled at `cliPath`.
 *
 * Returns undefined when the binary is missing or its output can't be parsed —
 * callers treat that as "unknown" rather than as a mismatch, since a missing
 * binary already fails loudly elsewhere.
 */
export async function getBundledCliVersion(
    cliPath: string
): Promise<string | undefined> {
    try {
        const {stdout} = await execFile(cliPath, [
            "version",
            "--output",
            "json",
        ]);
        const version = JSON.parse(stdout)["Version"];
        return typeof version === "string" ? version : undefined;
    } catch (e) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).debug(
            "Failed to read the bundled Databricks CLI version",
            e
        );
        return undefined;
    }
}

export function getCorrectVsixInstallString(
    nodeArch: ArchDetails,
    metaData: PackageMetaData
): string | undefined {
    const correctVsix = Array.from(vsixArchMap.entries()).find((keyValue) =>
        isEqual(keyValue[1], nodeArch)
    )?.[0];

    return correctVsix
        ? `Please install ${metaData.packageName}-${correctVsix}-${metaData.version}.vsix`
        : "Current system architecture is not supported.";
}

export function isCompatibleArchitecture(
    depName: string,
    depArch: ArchDetails | undefined,
    nodeArch: ArchDetails,
    metaData: PackageMetaData
) {
    if (depArch && !isEqual(depArch, nodeArch)) {
        window.showErrorMessage(
            [
                `The ${depName} architecture (${depArch?.os}_${depArch?.arch}) does not match system (${nodeArch?.os}_${nodeArch?.arch}). `,
                getCorrectVsixInstallString(nodeArch, metaData),
            ].join("")
        );
        return false;
    }
    return true;
}

/**
 * Warns when the bundled CLI is not the version `package.json` pins.
 *
 * `bin/` is gitignored, so the binary is fetched once by `package:cli:fetch` and
 * never updated by a `git pull`. A `cli.version` bump therefore leaves a stale
 * binary behind, and the resulting failure is opaque: the CLI rejects a
 * subcommand the extension expects, which aborts activation before the
 * configuration view leaves "Initializing...".
 *
 * Dev-only. A packaged extension fetches its CLI during the build, so the two
 * versions can't diverge there.
 */
export async function checkBundledCliVersion(
    cliPath: string,
    metaData: PackageMetaData
): Promise<boolean> {
    if (!isDevExtension() || metaData.cliVersion === undefined) {
        return true;
    }

    const actual = await getBundledCliVersion(cliPath);
    if (actual === undefined || actual === metaData.cliVersion) {
        return true;
    }

    const message =
        `The bundled Databricks CLI is v${actual}, but this checkout pins ` +
        `v${metaData.cliVersion}. Run "yarn workspace databricks run ` +
        `package:cli:fetch" and reload the window.`;
    logging.NamedLogger.getOrCreate(Loggers.Extension).warn(message);
    window.showWarningMessage(message);
    return false;
}

export async function checkArchCompat(context: ExtensionContext) {
    const metaData = await getMetadata(context);

    const nodeArch = getNodeArchDetails();

    return (
        isCompatibleArchitecture(
            "extension",
            metaData.vsixArch ? vsixArchMap.get(metaData.vsixArch) : undefined,
            nodeArch,
            metaData
        ) &&
        isCompatibleArchitecture(
            "databricks-cli",
            metaData.cliArch ? cliArchMap.get(metaData.cliArch) : undefined,
            nodeArch,
            metaData
        )
    );
}
