import fs from "node:fs/promises";
import {ExtensionContext, window} from "vscode";

type OsType = "windows" | "linux" | "macos";
type ArchType = "x64" | "arm64" | "x86_32";

interface ArchDetails {
    os?: OsType;
    arch?: ArchType;
}

interface MetaData {
    packageName: string;
    version: string;
    bricksArch?: string;
    vsixArch?: string;
    commitSha?: string;
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

const bricksArchMap: Map<string, ArchDetails> = new Map([
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

function getNodeArchDetails(): ArchDetails {
    return {
        os: nodeOsMap.get(process.platform),
        arch: nodeArchMap.get(process.arch),
    };
}

export function isEqual(l: ArchDetails, r: ArchDetails) {
    return l.os === r.os && l.arch === r.arch;
}

export async function getMetadata(context: ExtensionContext) {
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
        bricksArch: jsonData["arch"]?.["bricksArch"],
        vsixArch: jsonData["arch"]?.["vsixArch"],
        commitSha: jsonData["commitSha"],
    };
}

export function getCorrectVsixInstallString(
    nodeArch: ArchDetails,
    metaData: MetaData
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
    metaData: MetaData
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

export async function checkArchCompat(context: ExtensionContext) {
    const metaData = await getMetadata(context);

    const nodeArch = getNodeArchDetails();

    return (
        isCompatibleArchitecture(
            "extension",
            vsixArchMap.get(metaData.vsixArch),
            nodeArch,
            metaData
        ) &&
        isCompatibleArchitecture(
            "bricks-cli",
            bricksArchMap.get(metaData.bricksArch),
            nodeArch,
            metaData
        )
    );
}
