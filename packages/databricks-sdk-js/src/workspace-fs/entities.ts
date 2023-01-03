import {posix} from "path";
import {IWorkspaceFsEntity} from ".";
import {ApiClient, ApiClientResponseError, HttpError} from "../api-client";
import {ObjectInfo, WorkspaceService} from "../apis/workspace";
import {context, Context} from "../context";
import {ExposedLoggers, withLogContext} from "../logging";

export class ObjectInfoValidationError extends Error {
    constructor(message: string, readonly details: ObjectInfo) {
        super(message);
    }
}

class RequiredFields {
    "object_id" = "";
    "object_type" = "";
    "path" = "";
}
type RequiredObjectInfo = ObjectInfo & RequiredFields;

export abstract class WorkspaceFsEntity implements IWorkspaceFsEntity {
    private _workspaceFsService: WorkspaceService;
    private _children?: Array<IWorkspaceFsEntity>;
    private _details: RequiredObjectInfo;

    constructor(protected readonly _apiClient: ApiClient, details: ObjectInfo) {
        this._workspaceFsService = new WorkspaceService(this._apiClient);
        this._details = this.validateDetails(details);
    }

    @withLogContext(ExposedLoggers.SDK)
    private validateDetails(
        details: ObjectInfo,
        @context ctx?: Context
    ): RequiredObjectInfo {
        Object.keys(new RequiredFields()).forEach((field) => {
            if (details[field as keyof ObjectInfo] === undefined) {
                const err = new ObjectInfoValidationError(
                    `These fields are required for fs objects (${Object.keys(
                        new RequiredFields()
                    ).join(", ")})`,
                    details
                );
                ctx?.logger?.error("ObjectInfo validation error", err);
                throw err;
            }
        });

        return details as RequiredObjectInfo;
    }

    set details(details: ObjectInfo) {
        this._details = this.validateDetails(details);
    }

    get details() {
        return this._details;
    }

    get path() {
        return this._details.path;
    }

    protected async generateUrl(host: URL): Promise<string> {
        throw new Error("generateUrl not implemented");
    }

    get url() {
        return new Promise<string>((resolve) => {
            this._apiClient.host.then((host) =>
                resolve(this.generateUrl(host))
            );
        });
    }

    get type() {
        return this._details.object_type;
    }

    get id() {
        return this._details.object_id;
    }

    protected async fetchChildren() {
        function objIsDefined(
            obj: IWorkspaceFsEntity | undefined
        ): obj is IWorkspaceFsEntity {
            return obj !== undefined ? true : false;
        }

        this._children = (
            await this._workspaceFsService.list({path: this.path})
        ).objects
            ?.map((obj) => entityFromObjInfo(this._apiClient, obj))
            .filter(objIsDefined);
    }

    @withLogContext(ExposedLoggers.SDK)
    async refresh(@context ctx?: Context) {
        this._children = undefined;

        try {
            const details = await this._workspaceFsService.getStatus(
                {
                    path: this.path,
                },
                ctx
            );

            this.details = details;
            return this;
        } catch (e: unknown) {
            if (e instanceof ApiClientResponseError) {
                if (e.error_code === "RESOURCE_DOES_NOT_EXIST") {
                    return undefined;
                }
            }
        }
    }

    get children() {
        return new Promise<Array<IWorkspaceFsEntity>>((resolve) => {
            if (this._children === undefined) {
                this.fetchChildren().then(() => resolve(this._children ?? []));
            } else {
                resolve(this._children);
            }
        });
    }

    @withLogContext(ExposedLoggers.SDK, "WorkspaceFsEntity.fromPath")
    static async fromPath(
        apiClient: ApiClient,
        path: string,
        @context ctx?: Context
    ) {
        try {
            const entity = entityFromObjInfo(
                apiClient,
                await new WorkspaceService(apiClient).getStatus({path}, ctx)
            );
            return entity;
        } catch (e) {
            if (e instanceof ApiClientResponseError) {
                if (e.error_code === "RESOURCE_DOES_NOT_EXIST") {
                    return undefined;
                }
            }
        }
    }

    get parent(): Promise<IWorkspaceFsEntity | undefined> {
        const parentPath = posix.dirname(this.path);
        return WorkspaceFsEntity.fromPath(this._apiClient, parentPath);
    }
}

function entityFromObjInfo(
    apiClient: ApiClient,
    details: ObjectInfo
): IWorkspaceFsEntity | undefined {
    switch (details.object_type) {
        case "DIRECTORY":
            return new WorkspaceFsDir(apiClient, details);
        case "REPO":
            return new WorkspaceFsRepo(apiClient, details);
        case "FILE":
            return new WorkspaceFsFile(apiClient, details);
        case "NOTEBOOK":
            return new WorkspaceFsNotebook(apiClient, details);
    }
    return undefined;
}

export class WorkspaceFsFile extends WorkspaceFsEntity {
    override get children() {
        return Promise.resolve([]);
    }

    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${(await this.parent)?.id ?? ""}`;
    }
}

export class WorkspaceFsDir extends WorkspaceFsEntity {
    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${this.details.object_id}`;
    }
}

export class WorkspaceFsNotebook extends WorkspaceFsFile {
    get language() {
        return this.details.language;
    }
}

export class WorkspaceFsRepo extends WorkspaceFsDir {}
