import {window, commands, QuickPickItem, ProgressLocation} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Cluster} from "../sdk-extensions";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {Environment} from "./MsPythonExtensionApi";
import {environmentName} from "../utils/environmentUtils";

export class EnvironmentCommands {
    constructor(
        private featureManager: FeatureManager,
        private pythonExtension: MsPythonExtensionWrapper,
        private installer: EnvironmentDependenciesInstaller
    ) {}

    async setup(stepId?: string) {
        commands.executeCommand("configurationView.focus");
        await window.withProgress(
            {location: {viewId: "configurationView"}},
            () => this._setup(stepId)
        );
    }

    private async checkEnvironmentDependencies() {
        return await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Databricks: checking python environment`,
            },
            () =>
                this.featureManager.isEnabled("environment.dependencies", true)
        );
    }

    private async _setup(stepId?: string) {
        // Get the state from the cache, we will re-check the state after taking an action (e.g. asking a user to select a venv or install dbconnect).
        let state = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        for (const [, s] of state.steps) {
            if (!s.available && (!stepId || s.id === stepId) && s.action) {
                // Take an action of a failed step and re-check all steps state afterwards.
                // Re-checking is important to get the up to date `state.available` value.
                // It also fixes problems when Python extension doesn't notify us about the environment changes,
                // and we end up being stuck with the outdated UI warnings.
                await s.action();
                state = await this.checkEnvironmentDependencies();
                // All actions usually require user input (and can be cancelled), so here we stop after the first one
                // and let users re-run the setup based on the (updated) UI state in the Python Environment panel.
                break;
            }
        }
        if (state.available) {
            window.showInformationMessage(
                "Python environment and Databricks Connect are set up."
            );
        } else {
            const detail = Array.from(state.steps.values())
                .filter(
                    (s) => !s.available && !s.optional && (s.message || s.title)
                )
                .map((s) => s.message || s.title)
                .join("\n");
            window.showErrorMessage(
                `Failed to set up Python environment for Databricks Connect:\n${detail}`
            );
        }
    }

    async refresh() {
        await window.withProgress(
            {location: {viewId: "configurationView"}},
            () => this.checkEnvironmentDependencies()
        );
    }

    async selectPythonInterpreter() {
        const environments =
            await this.pythonExtension.getAvailableEnvironments();
        if (environments.length > 0) {
            await this.showEnvironmentsQuickPick(environments);
        } else {
            await this.pythonExtension.createPythonEnvironment();
        }
    }

    async showEnvironmentsQuickPick(environments: Environment[]) {
        const envPicks: (QuickPickItem & {path?: string})[] = environments.map(
            (env) => ({
                label: environmentName(env),
                description: env.path,
                path: env.path,
            })
        );
        const createNewLabel = "$(add) Create new environment";
        const usePythonExtensionLabel =
            "$(gear) Use Python Extension to setup environments";
        const staticPicks: QuickPickItem[] = [
            {label: createNewLabel, alwaysShow: true},
            {label: usePythonExtensionLabel, alwaysShow: true},
        ];
        const selectedPick = await window.showQuickPick(
            envPicks.concat(staticPicks),
            {title: "Select Python Environment"}
        );
        if (selectedPick) {
            if (selectedPick.label === createNewLabel) {
                await this.pythonExtension.createPythonEnvironment();
            } else if (selectedPick.label === usePythonExtensionLabel) {
                await this.pythonExtension.selectPythonInterpreter();
            } else if (selectedPick.path) {
                await this.pythonExtension.api.environments.updateActiveEnvironmentPath(
                    selectedPick.path
                );
            }
        }
    }

    async reinstallDBConnect(cluster?: Cluster) {
        const state = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        const envAvailable = state.steps.get("checkPythonEnvironment")
            ?.available;
        if (!envAvailable) {
            window.showErrorMessage("Activate a python environment first.");
            return;
        }

        let placeholderVersion = undefined;
        const dbrVersionParts = cluster?.dbrVersion;
        if (dbrVersionParts && dbrVersionParts[0] !== "x") {
            const minor = dbrVersionParts[1] === "x" ? "*" : dbrVersionParts[1];
            placeholderVersion = `${dbrVersionParts[0]}.${minor}.*`;
        }
        return this.installer.installWithVersionPrompt(placeholderVersion);
    }
}
