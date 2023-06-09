import {Config, WorkspaceClient} from "../src";

/**
 * Example to show logged in user information
 */
async function main() {
    const config = new Config({});
    const client = new WorkspaceClient(config);

    // eslint-disable-next-line no-console
    console.log(await client.currentUser.me());
}

main();
