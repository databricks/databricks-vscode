import {expect} from "chai";
import {QuickPick, QuickPickItem} from "vscode";
import {
    buildPresetPickItems,
    computeTargetLabel,
    pickSetupPreset,
    presetToFlags,
    PresetPickItem,
} from "./pythonSetupPresetPicker";

/**
 * A minimal, scriptable stand-in for a VS Code QuickPick, mirroring the fake
 * used in `AiToolsCommands.test.ts`. `onAccept` decides which item is selected
 * (from the items assigned to the pick) and whether the pick is accepted or
 * dismissed, then drives the accept/hide callbacks the way the real widget
 * would.
 */
class FakeQuickPick {
    title?: string;
    placeholder?: string;
    items: readonly QuickPickItem[] = [];
    selectedItems: readonly QuickPickItem[] = [];
    private acceptCbs: Array<() => void> = [];
    private hideCbs: Array<() => void> = [];
    public disposed = false;

    constructor(
        private readonly onAccept: (
            pick: FakeQuickPick
        ) => {selected: readonly QuickPickItem[]} | "dismiss"
    ) {}

    onDidAccept(cb: () => void) {
        this.acceptCbs.push(cb);
        return {dispose() {}};
    }
    onDidHide(cb: () => void) {
        this.hideCbs.push(cb);
        return {dispose() {}};
    }
    show() {
        const result = this.onAccept(this);
        if (result === "dismiss") {
            this.hideCbs.forEach((cb) => cb());
            return;
        }
        this.selectedItems = result.selected;
        this.acceptCbs.forEach((cb) => cb());
    }
    hide() {
        this.hideCbs.forEach((cb) => cb());
    }
    dispose() {
        this.disposed = true;
    }
}

/**
 * A factory that hands `pickSetupPreset` a `FakeQuickPick`, typed as the real
 * `window.createQuickPick` seam. `onAccept` scripts the widget's outcome, and
 * `created` exposes the instance so a test can read the title/placeholder/items
 * the picker set on it.
 */
function fakeCreateQuickPick(
    onAccept: (
        pick: FakeQuickPick
    ) => {selected: readonly QuickPickItem[]} | "dismiss"
) {
    const created: FakeQuickPick[] = [];
    const create = (() => {
        const pick = new FakeQuickPick(onAccept);
        created.push(pick);
        return pick as unknown as QuickPick<PresetPickItem>;
    }) as <T extends QuickPickItem>() => QuickPick<T>;
    return {create, created};
}

describe("presetToFlags", () => {
    it("maps the full preset to no skip flags", () => {
        expect(presetToFlags("full")).to.deep.equal({});
    });

    it("maps the dbconnect preset to --no-constraints only", () => {
        expect(presetToFlags("dbconnect")).to.deep.equal({
            skipConstraints: true,
        });
    });

    it("maps the python preset to both --no-constraints and --no-dbconnect", () => {
        expect(presetToFlags("python")).to.deep.equal({
            skipConstraints: true,
            skipDbconnect: true,
        });
    });
});

describe("buildPresetPickItems", () => {
    it("lists the three presets in the Full, DB Connect, Python order", () => {
        const items = buildPresetPickItems();
        expect(items.map((i) => i.preset)).to.deep.equal([
            "full",
            "dbconnect",
            "python",
        ]);
    });

    it("presents the Full row with its verbatim copy, starred and first", () => {
        const [full] = buildPresetPickItems();
        expect(full.label).to.equal("$(star-full) Full environment setup");
        expect(full.description).to.equal(
            "Recommended so code runs as it would on Databricks"
        );
        expect(full.detail).to.equal(
            "Installs matching Python + Databricks Connect versions and pins cluster dependencies."
        );
    });

    it("presents the DB Connect row with its verbatim copy", () => {
        const dbconnect = buildPresetPickItems()[1];
        expect(dbconnect.label).to.equal("$(tools) DB Connect setup");
        expect(dbconnect.description).to.equal(
            "Recommended to run Spark code remotely."
        );
        expect(dbconnect.detail).to.equal(
            "Installs matching Python + Databricks Connect versions only."
        );
    });

    it("presents the Python row with its verbatim copy and no description", () => {
        const python = buildPresetPickItems()[2];
        expect(python.label).to.equal("$(code) Python setup");
        expect(python.description).to.equal(undefined);
        expect(python.detail).to.equal(
            "Installs matching Python version only."
        );
    });
});

describe("computeTargetLabel", () => {
    it("labels a serverless target with its vN version", () => {
        expect(computeTargetLabel({kind: "serverless", version: "5"})).to.equal(
            "serverless v5"
        );
    });

    it("labels a cluster target with its major.minor runtime", () => {
        expect(
            computeTargetLabel({kind: "cluster", clusterId: "0710-abc"}, [
                17,
                3,
                "x",
            ])
        ).to.equal("Runtime 17.3");
    });

    it("falls back to a generic cluster label when the runtime is unparsable", () => {
        expect(
            computeTargetLabel({kind: "cluster", clusterId: "0710-abc"}, [
                "x",
                "x",
                "x",
            ])
        ).to.equal("the attached cluster");
    });

    it("falls back to a generic cluster label when no runtime is known", () => {
        expect(
            computeTargetLabel({kind: "cluster", clusterId: "0710-abc"})
        ).to.equal("the attached cluster");
    });
});

describe("pickSetupPreset", () => {
    it("titles the picker with the resolved compute and documents the side effects", async () => {
        const {create, created} = fakeCreateQuickPick(() => "dismiss");

        await pickSetupPreset("serverless v5", create);

        expect(created[0].title).to.equal(
            "Set up Python environment for serverless v5"
        );
        expect(created[0].placeholder).to.equal(
            "Create a uv managed .venv and pyproject.toml (if one exists, it's saved to pyproject.toml.bak)"
        );
        // The picker offers exactly the three preset rows.
        expect(created[0].items).to.have.length(3);
    });

    it("resolves the chosen preset when the user accepts a row", async () => {
        const {create} = fakeCreateQuickPick((pick) => ({
            // Accept the DB Connect row (the second one).
            selected: [pick.items[1]],
        }));

        expect(await pickSetupPreset("Runtime 17.3", create)).to.equal(
            "dbconnect"
        );
    });

    it("resolves undefined when the user dismisses the picker", async () => {
        const {create} = fakeCreateQuickPick(() => "dismiss");

        expect(await pickSetupPreset("Runtime 17.3", create)).to.equal(
            undefined
        );
    });

    it("disposes the picker once it hides", async () => {
        const {create, created} = fakeCreateQuickPick(() => "dismiss");

        await pickSetupPreset("serverless v5", create);

        expect(created[0].disposed).to.equal(true);
    });
});
