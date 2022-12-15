declare namespace WebdriverIO {
    interface Browser {
        /** return text for element having aria-label as `label` */
        getTextByLabel: (label: string) => Promise<string>;
    }

    interface MultiRemoteBrowser {}

    interface Element {
        /** return text for element having aria-label as `label` */
        getTextByLabel: (label: string) => Promise<string>;
    }
}
