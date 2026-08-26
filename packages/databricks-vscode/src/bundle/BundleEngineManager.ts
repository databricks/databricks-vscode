import {Disposable, Uri, env, window} from "vscode";
import {BundleValidateModel} from "./models/BundleValidateModel";
import {StateStorage} from "../vscode-objs/StateStorage";
import {Telemetry} from "../telemetry";
import {
    BundleTerraformEngineWarningAction,
    Events,
} from "../telemetry/constants";
import {withOnErrorHandler} from "../utils/onErrorDecorator";

export const DIRECT_ENGINE_DOCS_URL =
    "https://docs.databricks.com/aws/en/dev-tools/bundles/direct";
export const READ_MIGRATION_GUIDE_LABEL = "Read migration guide";
export const DONT_SHOW_AGAIN_LABEL = "Don't show again";

const HIDE_WARNING_KEY = "databricks.bundle.hideTerraformEngineWarning";

const WARNING_MESSAGE =
    "This bundle uses the Terraform deployment engine, which is deprecated " +
    "and will stop working in a future Databricks CLI version. Migrate to the " +
    "direct deployment engine.";

/**
 * The prompting surface {@link BundleEngineManager} needs, behind one seam so
 * the logic is unit-testable. The real implementation delegates to `window` /
 * `env`.
 *
 * This is a Manager that renders `window.*` itself (via the seam) rather than
 * delegating to a Commands/Component, since the warning is reactive to validate
 * state with no command trigger — matching the existing
 * {@link BundlePipelinesManager}, which surfaces its warnings the same way.
 */
export interface BundleEnginePrompter {
    showWarningMessage: (typeof window)["showWarningMessage"];
    openExternal: (typeof env)["openExternal"];
}

/**
 * Warns when a bundle's validate output reports the deprecated Terraform
 * deployment engine, offering a link to the migration guide. Shows at most once
 * per session per workspace; "Don't show again" persists the opt-out for the
 * workspace via {@link StateStorage}.
 */
export class BundleEngineManager implements Disposable {
    private disposables: Disposable[] = [];
    private warned = false;

    constructor(
        private readonly bundleValidateModel: BundleValidateModel,
        private readonly stateStorage: StateStorage,
        private readonly telemetry: Telemetry,
        private readonly prompter: BundleEnginePrompter = {
            showWarningMessage: window.showWarningMessage,
            openExternal: env.openExternal,
        }
    ) {
        this.disposables.push(
            this.bundleValidateModel.onDidChange(
                withOnErrorHandler(() => this.checkEngine(), {
                    log: true,
                    throw: false,
                })
            )
        );
    }

    private async checkEngine(): Promise<void> {
        if (this.warned || this.stateStorage.get(HIDE_WARNING_KEY)) {
            return;
        }
        const engine = await this.bundleValidateModel.get("engine");
        // Re-check `warned` after the await: a concurrent validate change may
        // have shown the warning while we were reading the engine.
        if (engine !== "terraform" || this.warned) {
            return;
        }
        this.warned = true;
        await this.warn();
    }

    private async warn(): Promise<void> {
        const choice = await this.prompter.showWarningMessage(
            WARNING_MESSAGE,
            READ_MIGRATION_GUIDE_LABEL,
            DONT_SHOW_AGAIN_LABEL
        );

        let action: BundleTerraformEngineWarningAction = "dismissed";
        if (choice === READ_MIGRATION_GUIDE_LABEL) {
            action = "guide";
            await this.prompter.openExternal(Uri.parse(DIRECT_ENGINE_DOCS_URL));
        } else if (choice === DONT_SHOW_AGAIN_LABEL) {
            action = "hidden";
            await this.stateStorage.set(HIDE_WARNING_KEY, true);
        }

        this.telemetry.recordEvent(Events.BUNDLE_TERRAFORM_ENGINE_WARNING, {
            action,
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
