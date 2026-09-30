import assert from "assert";
import {env} from "vscode";
import {spy, when, reset} from "ts-mockito";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {
    LANGUAGE_MODEL_CHAT_EXPERIMENT_ID,
    isLanguageModelChatEnabled,
} from "./languageModelChatExperiment";

describe(__filename, () => {
    let originalUriScheme: PropertyDescriptor | undefined;
    let configsSpy: typeof workspaceConfigs;

    function stubUriScheme(value: string) {
        Object.defineProperty(env, "uriScheme", {
            value,
            configurable: true,
        });
    }

    beforeEach(() => {
        originalUriScheme = Object.getOwnPropertyDescriptor(env, "uriScheme");
        configsSpy = spy(workspaceConfigs);
    });

    afterEach(() => {
        reset(configsSpy);
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

    it("is offered in the experiments.optInto setting", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const packageJson = require("../../package.json");
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
});
