import * as assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ExtensionContext, Uri} from "vscode";
import {UvBinaryProvider, uvArtifactName} from "./UvBinaryProvider";

// Buffer.from(string).buffer can point at a shared pool, so encode exactly.
function toArrayBuffer(s: string): ArrayBuffer {
    return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

class TestableUvProvider extends UvBinaryProvider {
    /** executables for which the version probe succeeds */
    probeSucceedsFor: string[] = [];
    fetchedUrls: string[] = [];
    artifacts: Record<string, ArrayBuffer> = {};

    protected override async probe(executable: string): Promise<boolean> {
        return this.probeSucceedsFor.includes(executable);
    }

    protected override async fetchArtifact(url: string): Promise<ArrayBuffer> {
        this.fetchedUrls.push(url);
        const artifact = this.artifacts[path.basename(url)];
        if (!artifact) {
            throw new Error(`fetch failed for ${url}`);
        }
        return artifact;
    }
}

describe(__filename, () => {
    describe("uvArtifactName", () => {
        it("should map the supported platforms", () => {
            assert.strictEqual(
                uvArtifactName("darwin", "arm64"),
                "uv-aarch64-apple-darwin.tar.gz"
            );
            assert.strictEqual(
                uvArtifactName("linux", "x64"),
                "uv-x86_64-unknown-linux-gnu.tar.gz"
            );
            assert.strictEqual(
                uvArtifactName("win32", "x64"),
                "uv-x86_64-pc-windows-msvc.zip"
            );
            assert.strictEqual(uvArtifactName("aix", "x64"), undefined);
            assert.strictEqual(uvArtifactName("linux", "ia32"), undefined);
        });
    });

    describe("getUvPath", () => {
        let storageDir: string;
        let provider: TestableUvProvider;

        beforeEach(() => {
            storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "uv-test-"));
            provider = new TestableUvProvider({
                globalStorageUri: Uri.file(storageDir),
            } as unknown as ExtensionContext);
        });

        afterEach(() => {
            fs.rmSync(storageDir, {recursive: true, force: true});
        });

        it("should prefer uv from PATH", async () => {
            provider.probeSucceedsFor = ["uv"];
            assert.strictEqual(await provider.getUvPath(), "uv");
            assert.deepStrictEqual(provider.fetchedUrls, []);
        });

        it("should use a previously downloaded binary", async () => {
            provider.probeSucceedsFor = [provider.uvBinaryPath];
            assert.strictEqual(
                await provider.getUvPath(),
                provider.uvBinaryPath
            );
            assert.deepStrictEqual(provider.fetchedUrls, []);
        });

        it("should reject downloads with a checksum mismatch", async () => {
            const artifact = uvArtifactName()!;
            provider.artifacts = {
                [artifact]: toArrayBuffer("not really uv"),
                [`${artifact}.sha256`]: toArrayBuffer(
                    `${"0".repeat(64)}  ${artifact}\n`
                ),
            };
            assert.strictEqual(await provider.getUvPath(), undefined);
            assert.strictEqual(provider.fetchedUrls.length, 2);
            assert.ok(!fs.existsSync(provider.uvBinaryPath));
        });

        it("should return undefined when the download fails", async () => {
            assert.strictEqual(await provider.getUvPath(), undefined);
            assert.ok(provider.fetchedUrls.length > 0);
        });
    });
});
