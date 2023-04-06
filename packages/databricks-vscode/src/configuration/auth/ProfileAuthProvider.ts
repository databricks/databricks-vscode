import {Config} from "@databricks/databricks-sdk";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {AuthProvider} from "./AuthProvider";

export class ProfileAuthProvider extends AuthProvider {
    constructor(host: URL, private readonly profile: string) {
        super(host, "profile");
    }

    describe(): string {
        return `Profile '${this.profile}'`;
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            profile: this.profile,
        };
    }

    async getSdkConfig(): Promise<Config> {
        return new Config({
            profile: this.profile,
            configFile:
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE,
            env: {},
        });
    }
}
