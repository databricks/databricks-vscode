import fs from "node:fs/promises";
import {ExtensionContext, window} from "vscode";

type OsType = "windows" | "linux" | "macos";
type ArchType = "x64" | "arm64" | "x86_32";

// Possible values https://nodejs.org/api/process.html#processplatform
const nodeOsMap: Map<string, OsType> = new Map([
    ["darwin", "macos"],
    ["linux", "linux"],
    ["win32", "windows"],
]);

// Possible values https://nodejs.org/api/process.html#processarch
const nodeArchMap: Map<string, ArchType> = new Map([
    ["arm64", "arm64"],
    ["x64", "x64"],
    ["ia32", "x86_32"],
]);

interface ArchDetails {
    os?: OsType;
    arch?: ArchType;
}

const bricksArchMap: Map<string, ArchDetails> = new Map([
    ["darwin_arm64", {os: "macos", arch: "arm64"}],
    ["darwin_amd64", {os: "macos", arch: "x64"}],
    ["linux_arm64", {os: "linux", arch: "arm64"}],
    ["linux_amd64", {os: "linux", arch: "x64"}],
    ["windows_arm64", {os: "windows", arch: "arm64"}],
    ["windows_amd64", {os: "windows", arch: "x64"}],
    ["windows_386", {os: "windows", arch: "x86_32"}],
]);

const vsixArchMap: Map<string, ArchDetails> = new Map([
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

function isSameArchitecture(
    depName: string,
    depArch: ArchDetails | undefined,
    nodeArch: ArchDetails
) {
    if (depArch && depArch !== nodeArch) {
        window.showErrorMessage(
            `The ${depName} architecutre (${depArch?.os}_${depArch?.arch}) does not match system (${nodeArch?.os}_${nodeArch?.arch}): `
        );
        return;
    }
}

export async function checkArchDetails(context: ExtensionContext) {
    const rawData = await fs.readFile(
        context.asAbsolutePath("./package.json"),
        {
            encoding: "utf-8",
        }
    );
    const depArchs = JSON.parse(rawData)["arch"];

    const bricksArch = depArchs["bricksArch"]
        ? bricksArchMap.get(depArchs["bricksArch"])
        : undefined;

    const vsixArch = depArchs["vsixArch"]
        ? vsixArchMap.get(depArchs["vsixArch"])
        : undefined;

    const nodeArch = getNodeArchDetails();

    isSameArchitecture("extension", vsixArch, nodeArch);
    isSameArchitecture("bricks-cli", bricksArch, nodeArch);
}
