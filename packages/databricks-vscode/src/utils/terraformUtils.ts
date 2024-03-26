import {writeFile} from "fs/promises";
import {ExtensionContext} from "vscode";

export type TerraformMetadataFromCli = {
    version: string;
    providerVersion: string;
    providerSource: string;
    providerHost: string;
};

export type TerraformMetadataExtra = {
    execRelPath: string;
    providersMirrorRelPath: string;
    terraformCliConfigRelPath: string;
};

export type TerraformMetadata = TerraformMetadataFromCli &
    TerraformMetadataExtra;

function getTerraformCliConfig(mirrorPath: string) {
    return `disable_checkpoint = true
provider_installation {
    filesystem_mirror {
        path = "${mirrorPath}"
    }
}`;
}

export async function updateTerraformCliConfig(
    context: ExtensionContext,
    terraformMetadata?: TerraformMetadata
) {
    if (!terraformMetadata) {
        return;
    }
    const configPath = context.asAbsolutePath(
        terraformMetadata.terraformCliConfigRelPath
    );
    const providersMirrorPath = context.asAbsolutePath(
        terraformMetadata.providersMirrorRelPath
    );
    const config = getTerraformCliConfig(providersMirrorPath);
    await writeFile(configPath, config, {encoding: "utf-8"});
}
