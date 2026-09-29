import assert from "assert";
import {QuickPickItemKind} from "vscode";
import {ConfigEntry} from "../cli/CliWrapper";
import {gatewayProfileQuickPickItems} from "./UnityGatewayLoginWizard";

function profile(
    name: string,
    overrides: Partial<ConfigEntry> = {}
): ConfigEntry {
    return {
        name,
        host: new URL(`https://${name}.cloud.databricks.com`),
        cloud: "aws" as ConfigEntry["cloud"],
        authType: "databricks-cli",
        valid: true,
        isDefault: false,
        ...overrides,
    };
}

describe(__filename, () => {
    it("puts the current profile first, then the CLI default", () => {
        const items = gatewayProfileQuickPickItems(
            [
                profile("first"),
                profile("cli-default", {isDefault: true}),
                profile("current"),
            ],
            "current"
        );

        assert.deepStrictEqual(
            items.map((item) => item.label),
            [
                "current",
                "cli-default",
                "first",
                "",
                "Sign in to another workspace",
            ]
        );
        assert.strictEqual(items[3].kind, QuickPickItemKind.Separator);
    });

    it("describes each profile's workspace and auth type", () => {
        const [item] = gatewayProfileQuickPickItems([
            profile("dogfood", {isDefault: true}),
        ]);

        assert.strictEqual(item.description, "dogfood.cloud.databricks.com");
        assert.strictEqual(item.detail, "OAuth · CLI default profile");
        assert.strictEqual(item.profile, "dogfood");
    });

    it("leaves out account-level profiles", () => {
        const items = gatewayProfileQuickPickItems([
            profile("account", {accountId: "123"}),
            profile("unified", {accountId: "123", workspaceId: "456"}),
        ]);

        assert.deepStrictEqual(
            items.map((item) => item.profile),
            ["unified", undefined, undefined]
        );
    });

    it("offers only signing in to another workspace when there are no profiles", () => {
        const items = gatewayProfileQuickPickItems([]);

        assert.deepStrictEqual(
            items.map((item) => item.label),
            ["Sign in to another workspace"]
        );
    });
});
