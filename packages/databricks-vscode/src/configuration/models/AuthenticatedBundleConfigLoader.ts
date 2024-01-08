import {Disposable} from "vscode";
import {AuthenticatedBundleModel} from "../../bundle/AuthenticatedBundleModel";
import {AuthProvider} from "../auth/AuthProvider";
import {
    AuthenticatedBundleConfig,
    isAuthenticatedBundleConfigKey,
} from "../types";
import {BundleTarget} from "../../bundle/types";
import {CachedValue} from "../../locking/CachedValue";

export class AuthenticatedBundleConfigLoader implements Disposable {
    private disposables: Disposable[] = [];

    private configCache = new CachedValue<
        AuthenticatedBundleConfig | undefined
    >(async () => {
        const configs = {} as any;
        const targetObject = await this.authenticatedBundleModel.read();

        for (const key of Object.keys(this.readerMapping)) {
            if (!isAuthenticatedBundleConfigKey(key)) {
                continue;
            }
            configs[key] = await this.readerMapping[key](targetObject);
        }
        return configs;
    });

    public onDidChange = this.configCache.onDidChange;

    private readonly readerMapping: Record<
        keyof AuthenticatedBundleConfig,
        (
            t?: BundleTarget
        ) => Promise<
            | AuthenticatedBundleConfig[keyof AuthenticatedBundleConfig]
            | undefined
        >
    > = {
        clusterId: async (target) => target?.bundle?.compute_id,
        workspaceFsPath: async (target) => target?.workspace?.file_path,
    };

    constructor(
        private readonly authenticatedBundleModel: AuthenticatedBundleModel
    ) {
        this.disposables.push(
            this.authenticatedBundleModel.onDidChange(async () => {
                await this.configCache.refresh();
            })
        );
    }

    async setTarget(target: string | undefined) {
        await this.authenticatedBundleModel.setTarget(target);
    }

    async setAuthProvider(authProvider: AuthProvider | undefined) {
        await this.authenticatedBundleModel.setAuthProvider(authProvider);
    }

    async load() {
        return await this.configCache.value;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
