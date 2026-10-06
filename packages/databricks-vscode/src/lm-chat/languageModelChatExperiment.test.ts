import assert from "assert";
import {env} from "vscode";
import {spy, when, reset} from "ts-mockito";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {
    LANGUAGE_MODEL_CHAT_EXPERIMENT_ID,
    isLanguageModelChatEnabled,
} from "./languageModelChatExperiment";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");
const FLAG_CONTEXT_KEY = "databricks.feature.chat.unityGateway";

describe(__filename, () => {
    let originalUriScheme: PropertyDescriptor | undefined;
    let originalEnv: NodeJS.ProcessEnv;
    let configsSpy: typeof workspaceConfigs;

    function stubUriScheme(value: string) {
        Object.defineProperty(env, "uriScheme", {
            value,
            configurable: true,
        });
    }

    beforeEach(() => {
        originalUriScheme = Object.getOwnPropertyDescriptor(env, "uriScheme");
        originalEnv = process.env;
        process.env = {...originalEnv};
        delete process.env.DATABRICKS_REMOTE_ENV;
        delete process.env.DATABRICKS_VIRTUAL_ENV;
        configsSpy = spy(workspaceConfigs);
    });

    afterEach(() => {
        reset(configsSpy);
        process.env = originalEnv;
        if (originalUriScheme !== undefined) {
            Object.defineProperty(env, "uriScheme", originalUriScheme);
        }
    });

    it("is disabled by default in VS Code", () => {
        stubUriScheme("vscode");
        when(configsSpy.experimetalFeatureOverides).thenReturn([]);
        assert.strictEqual(isLanguageModelChatEnabled(), false);
    });

    it("is enabled in VS Code after opt-in", () => {
        stubUriScheme("vscode");
        when(configsSpy.experimetalFeatureOverides).thenReturn([
            LANGUAGE_MODEL_CHAT_EXPERIMENT_ID,
        ]);
        assert.strictEqual(isLanguageModelChatEnabled(), true);
    });

    it("stays disabled in Cursor even after opt-in", () => {
        stubUriScheme("cursor");
        when(configsSpy.experimetalFeatureOverides).thenReturn([
            LANGUAGE_MODEL_CHAT_EXPERIMENT_ID,
        ]);
        assert.strictEqual(isLanguageModelChatEnabled(), false);
    });

    it("stays disabled in a remote session even after opt-in", () => {
        stubUriScheme("vscode");
        process.env.DATABRICKS_REMOTE_ENV = "1";
        process.env.DATABRICKS_VIRTUAL_ENV = "/tmp/venv";
        when(configsSpy.experimetalFeatureOverides).thenReturn([
            LANGUAGE_MODEL_CHAT_EXPERIMENT_ID,
        ]);
        assert.strictEqual(isLanguageModelChatEnabled(), false);
    });

    it("is offered in the experiments.optInto setting", () => {
        const optInto = packageJson.contributes.configuration
            .map(
                (section: any) =>
                    section.properties?.["databricks.experiments.optInto"]
            )
            .find(Boolean);
        assert.ok(
            optInto.items.enum.includes(LANGUAGE_MODEL_CHAT_EXPERIMENT_ID)
        );
    });

    it("gates every Unity Gateway command and menu entry on the flag", () => {
        const isUnityGatewayCommand = (command: string) =>
            command.startsWith("databricks.unityGateway.");
        const commands = packageJson.contributes.commands.filter((entry: any) =>
            isUnityGatewayCommand(entry.command)
        );
        assert.ok(commands.length > 0);
        for (const {command, enablement} of commands) {
            assert.ok(
                enablement?.includes(FLAG_CONTEXT_KEY),
                `${command} enablement`
            );
        }

        const menuEntries = Object.entries(
            packageJson.contributes.menus as Record<string, any[]>
        ).flatMap(([menu, entries]) =>
            entries
                .filter((entry) => isUnityGatewayCommand(entry.command ?? ""))
                .map((entry) => ({menu, ...entry}))
        );
        for (const {command} of commands) {
            assert.ok(
                menuEntries.some(
                    (entry) =>
                        entry.menu === "commandPalette" &&
                        entry.command === command
                ),
                `${command} has no commandPalette entry`
            );
        }
        for (const {menu, command, when} of menuEntries) {
            assert.ok(
                when?.includes(FLAG_CONTEXT_KEY),
                `${menu} entry for ${command}`
            );
        }
    });
});
