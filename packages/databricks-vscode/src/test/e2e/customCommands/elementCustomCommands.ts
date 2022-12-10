export function initialise() {
    browser.addCommand("getTextByLabel", getTextByLabel);
    browser.addCommand("getTextByLabel", getTextByLabel, true);
}

async function getTextByLabel(
    this: WebdriverIO.Element | WebdriverIO.Browser,
    label: string
) {
    const elem = await this.$(`aria/${label}`);
    // eslint-disable-next-line no-console
    console.error(label);
    // eslint-disable-next-line no-console
    console.error(await elem.getText());
    return elem.getText();
}
