import {ExtensionContext, Disposable, Uri, window} from "vscode";
import fs from "node:fs/promises";
import path from "path";
import os from "node:os";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {BundleFileSet, getSubProjects} from "./BundleFileSet";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {CachedValue} from "../locking/CachedValue";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {CliWrapper} from "../cli/CliWrapper";
import {LoginWizard, saveNewProfile} from "../configuration/LoginWizard";
import {Mutex} from "../locking";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import {ProjectConfigFile} from "../file-managers/ProjectConfigFile";
import {randomUUID} from "crypto";
import {onError} from "../utils/onErrorDecorator";
import {BundleInitWizard, promptToOpenSubProjects} from "./BundleInitWizard";
import {EventReporter, Events, Telemetry} from "../telemetry";

export class BundleProjectManager {
    private logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];

    private isBundleProjectCache = new CachedValue<boolean>(async () => {
        const rootBundleFile = await this.bundleFileSet.getRootFile();
        return rootBundleFile !== undefined;
    });

    public onDidChangeStatus = this.isBundleProjectCache.onDidChange;

    private projectServicesReady = false;
    private projectServicesMutex = new Mutex();

    private subProjects?: {relative: Uri; absolute: Uri}[];
    private legacyProjectConfig?: ProjectConfigFile;

    constructor(
        private context: ExtensionContext,
        private cli: CliWrapper,
        private customWhenContext: CustomWhenContext,
        private connectionManager: ConnectionManager,
        private configModel: ConfigModel,
        private bundleFileSet: BundleFileSet,
        private workspaceUri: Uri,
        private telemetry: Telemetry
    ) {
        this.disposables.push(
            this.bundleFileSet.bundleDataCache.onDidChange(async () => {
                try {
                    await this.isBundleProjectCache.refresh();
                } catch (error) {
                    this.logger.error(
                        "Failed to refresh isBundleProjectCache",
                        error
                    );
                }
            }),
            this.isBundleProjectCache.onDidChange(async () => {
                try {
                    await this.configureBundleProject();
                } catch (error) {
                    this.logger.error(
                        "Failed to configure bundle project after isBundleProject change",
                        error
                    );
                    const message =
                        (error as Error)?.message ?? "Unknown Error";
                    window.showErrorMessage(
                        `Failed to configure Databricks project: ${message}`
                    );
                }
            })
        );
    }

    public async isBundleProject(): Promise<boolean> {
        return await this.isBundleProjectCache.value;
    }

    public async configureWorkspace(): Promise<void> {
        // We listen to _isBundleProject changes and call configureBundleProject
        if (await this.isBundleProject()) {
            return;
        }
        const recordEvent = this.telemetry.start(
            Events.EXTENSION_INITIALIZATION
        );
        // This method updates subProjectsAvailabe context.
        // We have a configurationView that shows "openSubProjects" button if the context value is true.
        await this.detectSubProjects();
        // This method will try to automatically create bundle config if there's existing valid project.json config.
        // In the case project.json doesn't exist or its auth doesn't work, it sets pendingManualMigration context
        // to enable configurationView with the configureManualMigration button.
        await this.detectLegacyProjectConfig();

        const type = this.legacyProjectConfig ? "legacy" : "unknown";
        recordEvent({success: true, type});
    }

    private async configureBundleProject() {
        if (await this.isBundleProject()) {
            this.logger.debug(
                "Detected an existing bundle project, initializing project services"
            );
            return this.initProjectServices();
        } else {
            this.logger.debug(
                "No bundle config detected, disposing project services"
            );
            await this.disposeProjectServices();
        }
    }

    @Mutex.synchronise("projectServicesMutex")
    private async initProjectServices() {
        if (this.projectServicesReady) {
            this.logger.debug("Project services have already been initialized");
            return;
        }
        const recordEvent = this.telemetry.start(
            Events.EXTENSION_INITIALIZATION
        );
        try {
            await this.configModel.init();
            await this.connectionManager.init();
            this.projectServicesReady = true;
            recordEvent({success: true, type: "dabs"});
        } catch (e) {
            recordEvent({success: false, type: "dabs"});
            throw e;
        }
    }

    private async disposeProjectServices() {
        // TODO
    }

    private async detectSubProjects() {
        this.subProjects = await getSubProjects(this.workspaceUri);
        this.logger.debug(
            `Detected ${this.subProjects?.length} sub folders with bundle projects`
        );
        this.customWhenContext.setSubProjectsAvailable(
            this.subProjects?.length > 0
        );
    }

    public async openSubProjects() {
        if (this.subProjects && this.subProjects.length > 0) {
            return promptToOpenSubProjects(this.subProjects);
        }
    }

    private async detectLegacyProjectConfig() {
        this.legacyProjectConfig = await this.loadLegacyProjectConfig();
        // If we have subprojects, we can't migrate automatically. We show the user option to
        // manually migrate the project (create a new databricks.yml based on selected auth)
        if (!this.legacyProjectConfig || (this.subProjects?.length ?? 0) > 0) {
            this.customWhenContext.setPendingManualMigration(true);
            return;
        }
        this.logger.debug(
            "Detected a legacy project.json, starting automatic migration"
        );
        const recordEvent = this.telemetry.start(Events.AUTO_MIGRATION);
        try {
            await this.startAutomaticMigration(
                this.legacyProjectConfig,
                recordEvent
            );
        } catch (error) {
            recordEvent({success: false});
            this.customWhenContext.setPendingManualMigration(true);
            const message =
                "Failed to perform automatic migration to Databricks Asset Bundles.";
            this.logger.error(message, error);
            const errorMessage = (error as Error)?.message ?? "Unknown Error";
            window.showErrorMessage(`${message} ${errorMessage}`);
        }
    }

    private async loadLegacyProjectConfig(): Promise<
        ProjectConfigFile | undefined
    > {
        try {
            return await ProjectConfigFile.load(
                this.workspaceUri.fsPath,
                this.cli
            );
        } catch (error) {
            this.logger.error("Failed to load legacy project config:", error);
            return undefined;
        }
    }

    private async startAutomaticMigration(
        legacyProjectConfig: ProjectConfigFile,
        recordEvent: EventReporter<Events.AUTO_MIGRATION>
    ) {
        let authProvider = legacyProjectConfig.authProvider;
        if (!(await authProvider.check())) {
            this.logger.debug(
                "Legacy project auth was not successful, showing 'configure' welcome screen"
            );
            this.customWhenContext.setPendingManualMigration(true);
            recordEvent({success: false});
            return;
        }
        if (!(authProvider instanceof ProfileAuthProvider)) {
            const rnd = randomUUID().slice(0, 8);
            const profileName = `${authProvider.authType}-${rnd}`;
            this.logger.debug(
                "Creating new profile before bundle migration",
                profileName
            );
            authProvider = await saveNewProfile(
                profileName,
                authProvider,
                this.cli
            );
        }
        await this.migrateProjectJsonToBundle(
            authProvider as ProfileAuthProvider,
            legacyProjectConfig
        );
        recordEvent({success: true});
    }

    @onError({
        popup: {
            prefix: "Failed to migrate the project to Databricks Asset Bundles",
        },
    })
    public async startManualMigration() {
        const recordEvent = this.telemetry.start(Events.MANUAL_MIGRATION);
        try {
            const authProvider = await LoginWizard.run(this.cli);
            if (
                authProvider instanceof ProfileAuthProvider &&
                (await authProvider.check())
            ) {
                await this.migrateProjectJsonToBundle(
                    authProvider,
                    this.legacyProjectConfig
                );
                recordEvent({success: true});
            } else {
                recordEvent({success: false});
                this.logger.debug(
                    "Incorrect auth for the project.json migration"
                );
            }
        } catch (e) {
            recordEvent({success: false});
            throw e;
        }
    }

    private async migrateProjectJsonToBundle(
        authProvider: ProfileAuthProvider,
        legacyProjectConfig?: ProjectConfigFile
    ) {
        const configVars = {
            /* eslint-disable @typescript-eslint/naming-convention */
            project_name: path.basename(this.workspaceUri.fsPath),
            compute_id: legacyProjectConfig?.clusterId,
            root_path: legacyProjectConfig?.workspacePath?.path,
            /* eslint-enable @typescript-eslint/naming-convention */
        };
        this.logger.debug("Starting bundle migration, config:", configVars);
        const configFilePath = path.join(
            this.workspaceUri.fsPath,
            ".databricks",
            "migration-config.json"
        );
        await fs.mkdir(path.dirname(configFilePath), {recursive: true});
        await fs.writeFile(configFilePath, JSON.stringify(configVars, null, 4));

        // TODO: Add to .gitignore only if it's not already there
        await fs.appendFile(
            path.join(path.dirname(path.dirname(configFilePath)), ".gitignore"),
            os.EOL + ".databricks" + os.EOL
        );

        const templateDirPath = this.context.asAbsolutePath(
            path.join("resources", "migration-template")
        );
        await this.cli.bundleInit(
            templateDirPath,
            this.workspaceUri.fsPath,
            configFilePath,
            authProvider
        );
        this.logger.debug("Successfully finished bundle migration");
    }

    @onError({popup: {prefix: "Failed to initialize new Databricks project"}})
    public async initNewProject() {
        const bundleInitWizard = new BundleInitWizard(this.cli, this.telemetry);
        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        const parentFolder = await bundleInitWizard.initNewProject(
            this.workspaceUri,
            authProvider
        );
        if (parentFolder) {
            await this.isBundleProjectCache.refresh();
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
