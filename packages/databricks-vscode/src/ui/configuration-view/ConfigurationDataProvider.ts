import {Event} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {BaseConfigurationDataProvider} from "./BaseConfigurationDataProvider";
import {BundleTargetComponent} from "./BundleTargetComponent";
import {AuthTypeComponent} from "./AuthTypeComponent";
import {ClusterComponent} from "./ClusterComponent";
import {SyncDestinationComponent} from "./SyncDestinationComponent";
import {BundleProjectManager} from "../../bundle/BundleProjectManager";
import {CliWrapper} from "../../cli/CliWrapper";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {EnvironmentComponent} from "./EnvironmentComponent";
import {WorkspaceFolderComponent} from "./WorkspaceFolderComponent";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {CodeSynchronizer} from "../../sync";
import {AiToolsComponent} from "./AiToolsComponent";
import {AiToolsManager} from "../../aitools/AiToolsManager";
import {PythonSetupEntry} from "./pythonSetupEntry";
import {UnityGatewayConnectionComponent} from "./UnityGatewayConnectionComponent";
import type {UnityGatewayConnectionManager} from "../../lm-chat/UnityGatewayConnectionManager";

/** The Configuration view in normal mode; empty until the workspace is a bundle project. */
export class ConfigurationDataProvider extends BaseConfigurationDataProvider {
    constructor(
        connectionManager: ConnectionManager,
        codeSynchronizer: CodeSynchronizer,
        private readonly bundleProjectManager: BundleProjectManager,
        configModel: ConfigModel,
        cli: CliWrapper,
        featureManager: FeatureManager,
        workspaceFolderManager: WorkspaceFolderManager,
        aiToolsManager: AiToolsManager,
        unityGatewayConnectionManager: UnityGatewayConnectionManager,
        isUnityGatewayEnabled: () => boolean,
        onDidChangeUnityGatewayEnabled: Event<void>,
        pythonSetup?: PythonSetupEntry
    ) {
        super([
            new WorkspaceFolderComponent(workspaceFolderManager),
            new AiToolsComponent(aiToolsManager.model),
            new BundleTargetComponent(configModel),
            new AuthTypeComponent(
                connectionManager,
                configModel,
                cli,
                isUnityGatewayEnabled,
                onDidChangeUnityGatewayEnabled
            ),
            new UnityGatewayConnectionComponent(
                unityGatewayConnectionManager,
                isUnityGatewayEnabled,
                onDidChangeUnityGatewayEnabled
            ),
            new ClusterComponent(connectionManager, configModel),
            new SyncDestinationComponent(
                connectionManager,
                configModel,
                codeSynchronizer
            ),
            new EnvironmentComponent(
                featureManager,
                connectionManager,
                configModel,
                pythonSetup
            ),
        ]);
        this.disposables.push(
            this.bundleProjectManager.onDidChangeStatus(async () => {
                this.refresh();
            }),
            this.onDidChangeTreeData((e) => {
                if (e?.collapsibleState !== undefined) {
                    logging.NamedLogger.getOrCreate(Loggers.Extension).info(
                        `ConfigurationDataProvider.onDidChangeTreeData: ${e.label}`
                    );
                }
            })
        );
    }

    protected async visibleComponents(): Promise<BaseComponent[]> {
        return (await this.bundleProjectManager.isBundleProject())
            ? this.components
            : [];
    }
}
