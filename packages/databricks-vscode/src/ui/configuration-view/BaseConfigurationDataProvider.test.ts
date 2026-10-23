import {expect} from "chai";
import {BaseComponent} from "./BaseComponent";
import {BaseConfigurationDataProvider} from "./BaseConfigurationDataProvider";
import {ConfigurationTreeItem} from "./types";

class FakeComponent extends BaseComponent {
    constructor(
        private readonly children: () => Promise<ConfigurationTreeItem[]>
    ) {
        super();
    }

    getChildren(): Promise<ConfigurationTreeItem[]> {
        return this.children();
    }

    change() {
        this.onDidChangeEmitter.fire();
    }
}

class TestProvider extends BaseConfigurationDataProvider {
    public visible = true;

    protected async visibleComponents(): Promise<BaseComponent[]> {
        return this.visible ? this.components : [];
    }
}

function rows(...labels: string[]) {
    return async () => labels.map((label) => ({label}));
}

describe("BaseConfigurationDataProvider", () => {
    let provider: TestProvider | undefined;

    afterEach(() => {
        provider?.dispose();
    });

    it("concatenates the visible components' children in order", async () => {
        provider = new TestProvider([
            new FakeComponent(rows("a", "b")),
            new FakeComponent(rows("c")),
        ]);

        const labels = (await provider.getChildren()).map((r) => r.label);

        expect(labels).to.deep.equal(["a", "b", "c"]);
    });

    it("is empty when no component is visible", async () => {
        provider = new TestProvider([new FakeComponent(rows("a"))]);
        provider.visible = false;

        expect(await provider.getChildren()).to.deep.equal([]);
    });

    it("leaves out a component that fails and still renders the others", async () => {
        provider = new TestProvider([
            new FakeComponent(() => Promise.reject(new Error("boom"))),
            new FakeComponent(rows("ok")),
        ]);

        const labels = (await provider.getChildren()).map((r) => r.label);

        expect(labels).to.deep.equal(["ok"]);
    });

    it("refreshes when a component changes", () => {
        const component = new FakeComponent(rows("a"));
        provider = new TestProvider([component]);
        let refreshes = 0;
        provider.onDidChangeTreeData(() => refreshes++);

        component.change();

        expect(refreshes).to.equal(1);
    });

    it("stamps a copy kind onto value rows via getTreeItem", () => {
        provider = new TestProvider([]);
        const item: ConfigurationTreeItem = {
            label: "Target",
            description: "dev",
        };

        provider.getTreeItem(item);

        expect(item.contextValue).to.contain(".copy=target");
    });
});
