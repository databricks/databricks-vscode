import {window, commands, QuickPickItem} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {Cluster} from "../sdk-extensions";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";
import {Environment} from "./MsPythonExtensionApi";
import {environmentName} from "../utils/environmentUtils";
import {env} from "yargs";

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

    private async _setup(stepId?: string) {
        const state = await this.featureManager.isEnabled(
            "environment.dependencies",
            true
        );
        if (state.available) {
            window.showInformationMessage(
                "Python environment and Databricks Connect are already set up."
            );
            return true;
        }
        for (const [, step] of state.steps) {
            if (step.available || (stepId && step.id !== stepId)) {
                continue;
            }
            if (step.action) {
                return await step.action();
            } else if (step.message) {
                window.showErrorMessage(step.message);
                return false;
            }
        }
    }

    async refresh() {
        await window.withProgress(
            {location: {viewId: "configurationView"}},
            () =>
                this.featureManager.isEnabled("environment.dependencies", true)
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
