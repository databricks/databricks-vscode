import {Config, ConfigOptions} from "./config/Config";
import {ApiClient} from "./api-client";
import {ClustersService} from "./apis/clusters";
import {CommandExecutionService} from "./apis/commands";
import {DbfsService} from "./apis/dbfs";
import {LibrariesService} from "./apis/libraries";
import {PermissionsService} from "./apis/permissions";
import {ReposService} from "./apis/repos";
import {
    CurrentUserService,
    UsersService,
    GroupsService,
    ServicePrincipalsService,
} from "./apis/scim";
import {WorkspaceService} from "./apis/workspace";
import {WorkspaceConfService} from "./apis/workspaceconf";
import {JobsService} from "./apis/jobs";

export class WorkspaceClient {
    readonly config: Config;
    readonly apiClient: ApiClient;

    constructor(config: ConfigOptions | Config) {
        if (!(config instanceof Config)) {
            config = new Config(config);
        }

        this.config = config as Config;
        this.apiClient = new ApiClient(this.config);
    }

    get clusters() {
        return new ClustersService(this.apiClient);
    }

    get dbfs() {
        return new DbfsService(this.apiClient);
    }

    get commands() {
        return new CommandExecutionService(this.apiClient);
    }

    get jobs() {
        return new JobsService(this.apiClient);
    }

    get libraries() {
        return new LibrariesService(this.apiClient);
    }

    get repos() {
        return new ReposService(this.apiClient);
    }

    get currentUser() {
        return new CurrentUserService(this.apiClient);
    }

    get users() {
        return new UsersService(this.apiClient);
    }

    get groups() {
        return new GroupsService(this.apiClient);
    }

    get servicePrincipals() {
        return new ServicePrincipalsService(this.apiClient);
    }

    get workspace() {
        return new WorkspaceService(this.apiClient);
    }

    get workspaceConf() {
        return new WorkspaceConfService(this.apiClient);
    }

    get permissions() {
        return new PermissionsService(this.apiClient);
    }
}
