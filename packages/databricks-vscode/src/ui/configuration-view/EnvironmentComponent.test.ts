import {expect} from "chai";
import {anything, instance, mock, when} from "ts-mockito";
import {EnvironmentComponent} from "./EnvironmentComponent";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {ConfigurationTreeItem} from "./types";
import {PythonSetupEntry} from "./pythonSetupEntry";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const ENVIRONMENT_ROOT = {
    id: ENVIRONMENT_COMPONENT_ID,
} as ConfigurationTreeItem;
const PYTHON_SETUP_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP";

/** A stub {@link PythonSetupEntry} with no VS Code dependency. */
function stubPythonSetup(opts: {
    visible: boolean;
    ready: boolean;
    driftState?: "unset" | "ready" | "drifted";
}): PythonSetupEntry {
    return {
        isVisible: async () => opts.visible,
        ready: opts.ready,
        driftState: opts.driftState ?? "unset",
        // Minimal Event: registering a listener returns a no-op Disposable.
        onDidChangeState: () => ({dispose() {}}),
    };
}

describe("EnvironmentComponent dispatch", () => {
    let mockFeatureManager: FeatureManager;
    let mockConnectionManager: ConnectionManager;
    let mockConfigModel: ConfigModel;

    beforeEach(() => {
        mockFeatureManager = mock(FeatureManager);
        mockConnectionManager = mock(ConnectionManager);
        mockConfigModel = mock(ConfigModel);

        // Preconditions for getChildren to reach the dispatch branch.
        when(mockConnectionManager.state).thenReturn("CONNECTED");
        when(mockConfigModel.get("mode")).thenResolve("development" as any);
        // onDidChangeState is called in the constructor; return a no-op sub.
        when(
            mockFeatureManager.onDidChangeState(anything(), anything())
        ).thenReturn({dispose() {}} as any);
        // The legacy checklist: one not-yet-satisfied step.
        when(
            mockFeatureManager.isEnabled("environment.dependencies")
        ).thenResolve({
            available: false,
            steps: new Map([
                [
                    "install",
                    {id: "install", available: false, title: "Install deps"},
                ],
            ]),
        } as any);
    });

    function make(pythonSetup?: PythonSetupEntry) {
        return new EnvironmentComponent(
            instance(mockFeatureManager),
            instance(mockConnectionManager),
            instance(mockConfigModel),
            pythonSetup
        );
    }

    it("shows the legacy checklist when no python-setup entry is wired", async () => {
        const children = await make(undefined).getChildren(ENVIRONMENT_ROOT);

        expect(children).to.have.length(1);
        expect(children[0].label).to.equal("Install deps");
        expect(children.map((c) => c.id)).to.not.include(PYTHON_SETUP_ENTRY_ID);
    });

    it("shows the legacy checklist when the entry is not visible", async () => {
        const children = await make(
            stubPythonSetup({visible: false, ready: false})
        ).getChildren(ENVIRONMENT_ROOT);

        expect(children).to.have.length(1);
        expect(children[0].label).to.equal("Install deps");
        expect(children.map((c) => c.id)).to.not.include(PYTHON_SETUP_ENTRY_ID);
    });

    it("shows the Python Environment group at the top level when not visible", async () => {
        const root = await make(
            stubPythonSetup({visible: false, ready: false})
        ).getChildren();

        expect(root).to.have.length(1);
        expect(root[0].id).to.equal(ENVIRONMENT_COMPONENT_ID);
    });

    it("promotes the uv entry to the top level when visible", async () => {
        const component = make(stubPythonSetup({visible: true, ready: false}));

        // The top-level row is the uv entry itself, not a "Python Environment"
        // group wrapping it.
        const root = await component.getChildren();
        expect(root).to.have.length(1);
        expect(root[0].id).to.equal(PYTHON_SETUP_ENTRY_ID);

        // Being a leaf, it has no children — so the checklist never renders.
        const children = await component.getChildren(root[0]);
        expect(children).to.have.length(0);
    });
});
