type OsType = "windows" | "linux" | "macos";
type ArchType = "x64" | "arm64" | "x86_32";

export interface ArchDetails {
    os?: OsType;
    arch?: ArchType;
}

/** The fields the packaging scripts write into `package.json`. */
export interface PackageMetadata {
    packageName: string;
    version: string;
    cliArch?: string;
    vsixArch?: string;
    /** The CLI version the build pins. */
    cliVersion?: string;
}

// https://nodejs.org/api/process.html#processplatform
const nodeOsMap = new Map<string, OsType>([
    ["darwin", "macos"],
    ["linux", "linux"],
    ["win32", "windows"],
]);

// https://nodejs.org/api/process.html#processarch
const nodeArchMap = new Map<string, ArchType>([
    ["arm64", "arm64"],
    ["x64", "x64"],
    ["ia32", "x86_32"],
]);

const cliArchMap = new Map<string, ArchDetails>([
    ["darwin_arm64", { os: "macos", arch: "arm64" }],
    ["darwin_amd64", { os: "macos", arch: "x64" }],
    ["linux_arm64", { os: "linux", arch: "arm64" }],
    ["linux_amd64", { os: "linux", arch: "x64" }],
    ["windows_arm64", { os: "windows", arch: "arm64" }],
    ["windows_amd64", { os: "windows", arch: "x64" }],
    ["windows_386", { os: "windows", arch: "x86_32" }],
]);

const vsixArchMap = new Map<string, ArchDetails>([
    ["darwin-arm64", { os: "macos", arch: "arm64" }],
    ["darwin-x64", { os: "macos", arch: "x64" }],
    ["linux-arm64", { os: "linux", arch: "arm64" }],
    ["linux-x64", { os: "linux", arch: "x64" }],
    ["win32-arm64", { os: "windows", arch: "arm64" }],
    ["win32-x64", { os: "windows", arch: "x64" }],
    ["win32-ia32", { os: "windows", arch: "x86_32" }],
]);

export function packageMetadata(packageJson: {
    name?: string;
    version?: string;
    arch?: { cliArch?: string; vsixArch?: string };
    cli?: { version?: string };
}): PackageMetadata {
    return {
        packageName: packageJson.name ?? "",
        version: packageJson.version ?? "",
        cliArch: packageJson.arch?.cliArch,
        vsixArch: packageJson.arch?.vsixArch,
        cliVersion: packageJson.cli?.version,
    };
}

export function nodeArchDetails(
    platform: string = process.platform,
    arch: string = process.arch,
): ArchDetails {
    return { os: nodeOsMap.get(platform), arch: nodeArchMap.get(arch) };
}

function isEqual(l: ArchDetails, r: ArchDetails) {
    return l.os === r.os && l.arch === r.arch;
}

export function correctVsixInstallString(nodeArch: ArchDetails, metadata: PackageMetadata): string {
    const correctVsix = [...vsixArchMap.entries()].find(([, details]) =>
        isEqual(details, nodeArch),
    )?.[0];
    return correctVsix
        ? `Please install ${metadata.packageName}-${correctVsix}-${metadata.version}.vsix`
        : "Current system architecture is not supported.";
}

/**
 * Checks that the VSIX and the bundled CLI were built for this machine.
 * Returns the error to show, or undefined when they match. A development
 * build has no `arch` fields, and always passes.
 */
export function checkArchitecture(
    metadata: PackageMetadata,
    nodeArch: ArchDetails = nodeArchDetails(),
): string | undefined {
    const deps: [string, ArchDetails | undefined][] = [
        ["extension", metadata.vsixArch ? vsixArchMap.get(metadata.vsixArch) : undefined],
        ["databricks-cli", metadata.cliArch ? cliArchMap.get(metadata.cliArch) : undefined],
    ];
    for (const [name, depArch] of deps) {
        if (depArch && !isEqual(depArch, nodeArch)) {
            return [
                `The ${name} architecture (${depArch.os}_${depArch.arch}) does not match system (${nodeArch.os}_${nodeArch.arch}). `,
                correctVsixInstallString(nodeArch, metadata),
            ].join("");
        }
    }
    return undefined;
}
