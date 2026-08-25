import assert from "assert";
import {Disposable, Uri} from "vscode";
import {
    anything,
    deepEqual,
    instance,
    mock,
    reset,
    verify,
    when,
} from "ts-mockito";
import {StateStorage} from "../vscode-objs/StateStorage";
import {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import {BundleValidateModel} from "./models/BundleValidateModel";
import {
    BundleEngineManager,
    BundleEnginePrompter,
    DIRECT_ENGINE_DOCS_URL,
    READ_MIGRATION_GUIDE_LABEL,
    DONT_SHOW_AGAIN_LABEL,
} from "./BundleEngineManager";

const HIDE_KEY = "databricks.bundle.hideTerraformEngineWarning";

/**
 * Hand-rolled stand-in for {@link BundleValidateModel}: the base model exposes
 * `onDidChange` and `get` as bound instance fields, which ts-mockito can't stub,
 * so we drive them directly. `fire()` replays a validate-state change.
 */
class FakeValidateModel {
    private listeners: Array<() => unknown> = [];
    public engine: string | undefined;

    onDidChange(cb: () => unknown): Disposable {
        this.listeners.push(cb);
        return {dispose() {}};
    }

    async get(): Promise<string | undefined> {
        return this.engine;
    }

    async fire(): Promise<void> {
        for (const cb of this.listeners) {
            await cb();
        }
    }
}

function makePrompter(choice: string | undefined): {
    prompter: BundleEnginePrompter;
    opened: Uri[];
    shownCount: () => number;
} {
    const opened: Uri[] = [];
    let shown = 0;
    const prompter: BundleEnginePrompter = {
        showWarningMessage: (() => {
            shown++;
            return Promise.resolve(choice);
        }) as BundleEnginePrompter["showWarningMessage"],
        openExternal: ((uri: Uri) => {
            opened.push(uri);
            return Promise.resolve(true);
        }) as BundleEnginePrompter["openExternal"],
    };
    return {prompter, opened, shownCount: () => shown};
}

describe("BundleEngineManager", () => {
    let fakeModel: FakeValidateModel;
    let mockStorage: StateStorage;
    let mockTelemetry: Telemetry;

    function build(prompter: BundleEnginePrompter): BundleEngineManager {
        return new BundleEngineManager(
            fakeModel as unknown as BundleValidateModel,
            instance(mockStorage),
            instance(mockTelemetry),
            prompter
        );
    }

    beforeEach(() => {
        fakeModel = new FakeValidateModel();
        mockStorage = mock(StateStorage);
        mockTelemetry = mock(Telemetry);
        when(mockStorage.get(HIDE_KEY)).thenReturn(false);
    });

    afterEach(() => {
        reset(mockStorage);
        reset(mockTelemetry);
    });

    it("warns when the engine is terraform", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeModel.engine = "terraform";

        await fakeModel.fire();

        assert.strictEqual(shownCount(), 1);
    });

    it("does not warn when the engine is direct", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeModel.engine = "direct";

        await fakeModel.fire();

        assert.strictEqual(shownCount(), 0);
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_TERRAFORM_ENGINE_WARNING,
                anything()
            )
        ).never();
    });

    it("does not warn when the engine is unset", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeModel.engine = undefined;

        await fakeModel.fire();

        assert.strictEqual(shownCount(), 0);
    });

    it("does not warn when the user has opted out", async () => {
        when(mockStorage.get(HIDE_KEY)).thenReturn(true);
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeModel.engine = "terraform";

        await fakeModel.fire();

        assert.strictEqual(shownCount(), 0);
    });

    it("warns at most once per session even across repeated validations", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeModel.engine = "terraform";

        await fakeModel.fire();
        await fakeModel.fire();
        await fakeModel.fire();

        assert.strictEqual(shownCount(), 1);
    });

    it("opens the migration guide and records 'guide'", async () => {
        const {prompter, opened} = makePrompter(READ_MIGRATION_GUIDE_LABEL);
        build(prompter);
        fakeModel.engine = "terraform";

        await fakeModel.fire();

        assert.strictEqual(opened.length, 1);
        assert.strictEqual(
            opened[0].toString(),
            Uri.parse(DIRECT_ENGINE_DOCS_URL).toString()
        );
        verify(mockStorage.set(HIDE_KEY, true)).never();
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_TERRAFORM_ENGINE_WARNING,
                deepEqual({action: "guide"})
            )
        ).once();
    });

    it("persists opt-out and records 'hidden' on 'Don't show again'", async () => {
        const {prompter, opened} = makePrompter(DONT_SHOW_AGAIN_LABEL);
        build(prompter);
        fakeModel.engine = "terraform";

        await fakeModel.fire();

        assert.strictEqual(opened.length, 0);
        verify(mockStorage.set(HIDE_KEY, true)).once();
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_TERRAFORM_ENGINE_WARNING,
                deepEqual({action: "hidden"})
            )
        ).once();
    });

    it("records 'dismissed' when the warning is closed without a choice", async () => {
        const {prompter, opened} = makePrompter(undefined);
        build(prompter);
        fakeModel.engine = "terraform";

        await fakeModel.fire();

        assert.strictEqual(opened.length, 0);
        verify(mockStorage.set(HIDE_KEY, true)).never();
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_TERRAFORM_ENGINE_WARNING,
                deepEqual({action: "dismissed"})
            )
        ).once();
    });
});
