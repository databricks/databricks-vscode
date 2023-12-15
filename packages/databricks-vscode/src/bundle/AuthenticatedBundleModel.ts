import {Disposable, Uri} from "vscode";
import {BundleWatcher} from "./BundleWatcher";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {Mutex} from "../locking";
import {CliWrapper} from "../cli/CliWrapper";
import {BundleTarget} from "./types";
import {CachedValue} from "../locking/CachedValue";
import {onError} from "../utils/onErrorDecorator";
import lodash from "lodash";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export class AuthenticatedBundleModel implements Disposable {
    private disposables: Disposable[] = [];
    private mutex = new Mutex();

    private target: string | undefined;
    private authProvider: AuthProvider | undefined;

    private configCache = new CachedValue<BundleTarget | undefined>(
        this.readAll.bind(this)
    );

    @onError({popup: {prefix: "Failed to read bundle config."}})
    private async readAll() {
        if (this.target === undefined || this.authProvider === undefined) {
            return;
        }

        return JSON.parse(
            await this.cli.bundleValidate(
                this.target,
                this.authProvider,
                this.workspaceFolder,
                workspaceConfigs.databrickscfgLocation
            )
        ) as BundleTarget;
    }

    public onDidChange = this.configCache.onDidChange;

    constructor(
        private readonly bundleWatcher: BundleWatcher,
        private readonly cli: CliWrapper,
        private readonly workspaceFolder: Uri
    ) {
        this.disposables.push(
            this.bundleWatcher.onDidChange(async () => {
                await this.configCache.refresh();
            })
        );
    }

    @Mutex.synchronise("mutex")
    public async setTarget(target: string | undefined) {
        if (this.target === target) {
            return;
        }
        this.target = target;
        this.authProvider = undefined;
        await this.configCache.refresh();
    }

    @Mutex.synchronise("mutex")
    public async setAuthProvider(authProvider: AuthProvider | undefined) {
        this.authProvider = authProvider;
        if (
            lodash.isEqual(this.authProvider?.toJSON(), authProvider?.toJSON())
        ) {
            await this.configCache.refresh();
        }
    }

    @Mutex.synchronise("mutex")
    public async read() {
        return await this.configCache.value;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
