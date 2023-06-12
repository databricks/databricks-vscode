import {Config, AccountClient} from "../src";

/**
 * Example to list account groups on Azure using Azure CLI authentication
 */
async function main() {
    const config = new Config({});
    const client = new AccountClient(config);

    for await (const group of client.groups.list({})) {
        // eslint-disable-next-line no-console
        console.log(group);
    }
}

main();
