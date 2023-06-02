const sdk = require("..");

/**
 * Example to list account groups on Azure using Azure CLI authentication
 */
async function main() {
    const config = new sdk.Config({
        host: "https://accounts.azuredatabricks.net/",
        authType: "azure-cli",
    });
    const client = new sdk.AccountClient(config);

    console.log(await client.accountGroups.list());
}

main();
