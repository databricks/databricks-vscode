// @wdio/utils 9 points the types of its `./node` export at
// src/node/index.d.ts, which its package doesn't include. This is the one
// function wdio.conf.ts uses, as build/node/manager.d.ts declares it.
declare module "@wdio/utils/node" {
    export function setupDriver(
        options: Omit<WebdriverIO.Config, "capabilities">,
        caps: WebdriverIO.Capabilities[],
    ): Promise<unknown[] | undefined>;
}
