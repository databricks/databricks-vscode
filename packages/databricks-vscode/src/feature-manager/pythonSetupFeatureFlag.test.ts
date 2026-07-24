import {expect} from "chai";
import {spy, when, reset} from "ts-mockito";
import {FeatureManager, PYTHON_SETUP_FEATURE_ID} from "./FeatureManager";
import {EnabledFeature} from "./EnabledFeature";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");

/**
 * `contributes.configuration` is an array of setting sections; look a property
 * up across all of them rather than assuming a single section at a fixed index.
 */
function configProperty(id: string): any {
    const sections = packageJson.contributes.configuration as Array<{
        properties?: Record<string, any>;
    }>;
    for (const section of sections) {
        if (section.properties && id in section.properties) {
            return section.properties[id];
        }
    }
    return undefined;
}

/**
 * The python-setup feature is unlocked only when the user adds a string to
 * `databricks.experiments.optInto` that FeatureManager matches *verbatim*
 * against the disabled feature id. If the package.json opt-in enum and
 * PYTHON_SETUP_FEATURE_ID ever drift apart, the feature becomes impossible to
 * enable (the setting a user could pick would never equal the id). These tests
 * pin the coupling so that drift fails CI instead of silently shipping a
 * feature nobody can turn on.
 */
describe("python-setup feature flag", () => {
    const optInto = configProperty("databricks.experiments.optInto");

    it("exposes the feature id as an opt-in enum value in package.json", () => {
        expect(optInto.items.enum).to.include(PYTHON_SETUP_FEATURE_ID);
    });

    it("documents the opt-in value (enum and descriptions stay aligned)", () => {
        const index = optInto.items.enum.indexOf(PYTHON_SETUP_FEATURE_ID);
        expect(index).to.be.greaterThan(-1);
        expect(optInto.items.enumDescriptions).to.have.length(
            optInto.items.enum.length
        );
        expect(optInto.items.enumDescriptions[index]).to.be.a("string").and.not
            .empty;
    });

    it("contributes the temporary cliPathOverride setting", () => {
        const setting = configProperty(
            "databricks.experiments.cliPathOverride"
        );
        expect(setting).to.not.equal(undefined);
        expect(setting.type).to.equal("string");
        expect(setting.default).to.equal("");
    });

    it("is disabled by default when nothing is opted in", async () => {
        // No `experiments.optInto` configured in the test host, so a feature
        // registered in the disabled list must not unlock -- even though its
        // factory would otherwise produce an always-available EnabledFeature.
        const manager = new FeatureManager([PYTHON_SETUP_FEATURE_ID]);
        manager.registerFeature(
            PYTHON_SETUP_FEATURE_ID,
            () => new EnabledFeature()
        );
        expect(
            (await manager.isEnabled(PYTHON_SETUP_FEATURE_ID)).available
        ).to.equal(false);
    });

    it("unlocks once the id is added to experiments.optInto", async () => {
        // The whole point of the opt-in string: a user who adds
        // PYTHON_SETUP_FEATURE_ID to `databricks.experiments.optInto` must see
        // the feature become available. This is the path a later ticket's
        // consumer relies on, so pin it now.
        const configsSpy = spy(workspaceConfigs);
        when(configsSpy.experimetalFeatureOverides).thenReturn([
            PYTHON_SETUP_FEATURE_ID,
        ]);
        try {
            const manager = new FeatureManager([PYTHON_SETUP_FEATURE_ID]);
            manager.registerFeature(
                PYTHON_SETUP_FEATURE_ID,
                () => new EnabledFeature()
            );
            expect(
                (await manager.isEnabled(PYTHON_SETUP_FEATURE_ID)).available
            ).to.equal(true);
        } finally {
            reset(configsSpy);
        }
    });
});
