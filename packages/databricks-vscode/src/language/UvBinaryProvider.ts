import {CancellationToken, ExtensionContext} from "vscode";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {createHash} from "node:crypto";
import {cancellableExecFile} from "../cli/CliWrapper";
import {NamedLogger} from "@databricks/sdk-experimental/dist/logging";
import {Loggers} from "../logger";

/**
 * Pinned uv release we download when uv is not already installed.
 * Bump deliberately: the download URL, archive layout and checksum format
 * are validated for this version.
 */
export const UV_VERSION = "0.7.13";

export function uvArtifactName(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch
): string | undefined {
    const archPart = {x64: "x86_64", arm64: "aarch64"}[arch];
    if (!archPart) {
        return undefined;
    }
    switch (platform) {
        case "darwin":
            return `uv-${archPart}-apple-darwin.tar.gz`;
        case "linux":
            return `uv-${archPart}-unknown-linux-gnu.tar.gz`;
        case "win32":
            return `uv-${archPart}-pc-windows-msvc.zip`;
        default:
            return undefined;
    }
}

/**
 * Locates a uv binary: prefers one already on PATH (so corporate installs
 * with preconfigured proxies and mirrors keep working), then a previously
 * downloaded one, and finally downloads a pinned release into the
 * extension's global storage.
 */
export class UvBinaryProvider {
    private readonly logger = NamedLogger.getOrCreate(Loggers.Extension);

    constructor(private readonly context: ExtensionContext) {}

    get uvBinaryPath(): string {
        return path.join(
            this.context.globalStorageUri.fsPath,
            "uv",
            UV_VERSION,
            process.platform === "win32" ? "uv.exe" : "uv"
        );
    }

    protected async probe(
        executable: string,
        token?: CancellationToken
    ): Promise<boolean> {
        try {
            await cancellableExecFile(
                executable,
                ["--version"],
                {shell: false},
                token
            );
            return true;
        } catch {
            return false;
        }
    }

    async getUvPath(token?: CancellationToken): Promise<string | undefined> {
        if (await this.probe("uv", token)) {
            return "uv";
        }
        if (await this.probe(this.uvBinaryPath, token)) {
            return this.uvBinaryPath;
        }
        try {
            await this.download(token);
        } catch (e) {
            this.logger.error("Failed to download uv", e);
            return undefined;
        }
        return (await this.probe(this.uvBinaryPath, token))
            ? this.uvBinaryPath
            : undefined;
    }

    protected async fetchArtifact(url: string): Promise<ArrayBuffer> {
        const response = await fetch(url, {redirect: "follow"});
        if (!response.ok) {
            throw new Error(`Failed to download ${url}: ${response.status}`);
        }
        return await response.arrayBuffer();
    }

    private async download(token?: CancellationToken): Promise<void> {
        const artifact = uvArtifactName();
        if (!artifact) {
            throw new Error(
                `Unsupported platform for uv: ${process.platform}/${process.arch}`
            );
        }
        const baseUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`;
        const [archive, checksumFile] = await Promise.all([
            this.fetchArtifact(`${baseUrl}/${artifact}`),
            this.fetchArtifact(`${baseUrl}/${artifact}.sha256`),
        ]);

        const expectedSha = Buffer.from(checksumFile)
            .toString("utf-8")
            .trim()
            .split(/\s+/)[0];
        const actualSha = createHash("sha256")
            .update(Buffer.from(archive))
            .digest("hex");
        if (expectedSha !== actualSha) {
            throw new Error(
                `Checksum mismatch for ${artifact}: expected ${expectedSha}, got ${actualSha}`
            );
        }

        const targetDir = path.dirname(this.uvBinaryPath);
        await fs.mkdir(targetDir, {recursive: true});
        const archivePath = path.join(
            await fs.mkdtemp(path.join(os.tmpdir(), "databricks-uv-")),
            artifact
        );
        try {
            await fs.writeFile(archivePath, Buffer.from(archive));
            await this.extract(archivePath, targetDir, token);
            if (process.platform !== "win32") {
                await fs.chmod(this.uvBinaryPath, 0o755);
            }
        } finally {
            await fs.rm(path.dirname(archivePath), {
                recursive: true,
                force: true,
            });
        }
    }

    private async extract(
        archivePath: string,
        targetDir: string,
        token?: CancellationToken
    ): Promise<void> {
        // bsdtar (shipped with macOS, most Linux distros and Windows 10+)
        // extracts both formats. Windows zips contain uv.exe at the archive
        // root, tarballs contain a uv-<triple>/ directory with the binary.
        const args = archivePath.endsWith(".zip")
            ? ["-xf", archivePath, "-C", targetDir]
            : ["-xzf", archivePath, "-C", targetDir, "--strip-components=1"];
        await cancellableExecFile("tar", args, {shell: false}, token);
    }
}
