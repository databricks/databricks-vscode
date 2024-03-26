import {mkdirp} from "fs-extra";
import assert from "node:assert";
import {spawnSync} from "node:child_process";
import {cp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import yargs from "yargs";
import type {
    TerraformMetadata,
    TerraformMetadataFromCli,
} from "../src/utils/terraformUtils";

async function main() {
    const argv = await yargs
        .option("cli", {
            description: "Path to the Databricks CLI",
            type: "string",
            requiresArg: true,
        })
        .option("binDir", {
            description: "Path to the bin directory",
            type: "string",
            requiresArg: true,
        })
        .option("arch", {
            description: "Architecture of databricks cli.",
            type: "string",
            requiresArg: true,
        })
        .option("package", {
            description: "path/to/package.json",
            type: "string",
            requiresArg: true,
        }).argv;

    const res = spawn(argv.cli!, [
        "bundle",
        "debug",
        "terraform",
        "--output",
        "json",
    ]);
    const dependencies = JSON.parse(res.stdout.toString());
    const terraform = dependencies.terraform as TerraformMetadataFromCli;
    assert(terraform, "cli must return terraform dependencies");
    assert(terraform.version, "cli must return terraform version");
    assert(terraform.providerHost, "cli must return provider host");
    assert(terraform.providerSource, "cli must return provider source");
    assert(terraform.providerVersion, "cli must return provider version");

    const tempDir = path.join(tmpdir(), `terraform_${Date.now()}`);
    const depsDir = path.join(argv.binDir!, "dependencies");
    await mkdirp(tempDir);
    await mkdirp(depsDir);

    // Download terraform bin for the selected arch
    const arch = argv.arch!;
    const terraformZip = `terraform_${terraform.version}_${arch}.zip`;
    const terraformUrl = `https://releases.hashicorp.com/terraform/${terraform.version}/${terraformZip}`;
    spawn("curl", ["-sLO", terraformUrl], {cwd: tempDir});
    // Check sha of the archive
    const shasumsFile = `terraform_${terraform.version}_SHA256SUMS`;
    const shasumsUrl = `https://releases.hashicorp.com/terraform/${terraform.version}/${shasumsFile}`;
    spawn("curl", ["-sLO", shasumsUrl], {cwd: tempDir});
    const shasumRes = spawn(
        "shasum",
        ["--algorithm", "256", "--check", shasumsFile],
        {cwd: tempDir}
    );
    assert(
        shasumRes.output.toString().includes(`${terraformZip}: OK`),
        "sha256sum check failed"
    );
    spawn("unzip", ["-q", terraformZip], {cwd: tempDir});
    const terraformBinRelPath = path.join(depsDir, "terraform");
    await cp(`${tempDir}/terraform`, terraformBinRelPath);
    // Set the path to the terraform bin, the extension will use it to setup the environment variables
    const execRelPath = terraformBinRelPath;

    // Download databricks provider archive for the selected arch
    const providerZip = `terraform-provider-databricks_${terraform.providerVersion}_${arch}.zip`;
    spawn(
        "gh",
        [
            "release",
            "download",
            `v${terraform.providerVersion}`,
            "--pattern",
            providerZip,
            "--repo",
            "databricks/terraform-provider-databricks",
        ],
        {cwd: tempDir}
    );
    const providersMirrorRelPath = path.join(depsDir, "providers");
    const databricksProviderDir = path.join(
        providersMirrorRelPath,
        terraform.providerHost,
        terraform.providerSource
    );
    await mkdirp(databricksProviderDir);
    await cp(
        path.join(tempDir, providerZip),
        path.join(databricksProviderDir, providerZip)
    );
    // Set the path to the providers mirror dir, the extension will use it
    // to create the terraform CLI config at runtime.
    const terraformCliConfigRelPath = path.join(depsDir, "config.tfrc");

    // Save the info about all dependencies to the package.json
    const terraformMetadata: TerraformMetadata = {
        ...terraform,
        execRelPath,
        providersMirrorRelPath,
        terraformCliConfigRelPath,
    };
    const rawData = await readFile(argv.package!, {encoding: "utf-8"});
    const jsonData = JSON.parse(rawData);
    jsonData["terraformMetadata"] = terraformMetadata;
    await writeFile(argv.package!, JSON.stringify(jsonData, null, 4), {
        encoding: "utf-8",
    });
}

function spawn(command: string, args: string[], options: any = {}) {
    const child = spawnSync(command, args, options);
    if (child.error) {
        throw child.error;
    } else {
        return child;
    }
}

main();
