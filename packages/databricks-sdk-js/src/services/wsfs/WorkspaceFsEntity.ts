import {posix} from "path";
import {ApiClientResponseError} from "../../api-client";
import {ObjectInfo, WorkspaceService} from "../../apis/workspace";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {
    WorkspaceFsDir,
    WorkspaceFsRepo,
    WorkspaceFsFile,
    WorkspaceFsNotebook,
} from ".";
import {WorkspaceClient} from "../../WorkspaceClient";

export class ObjectInfoValidationError extends Error {
    constructor(message: string, readonly details: ObjectInfo) {
        super(message);
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
class RequiredFields {
    "object_id" = "";
    "object_type" = "";
    "path" = "";
}
/* eslint-enable @typescript-eslint/naming-convention */

type RequiredObjectInfo = ObjectInfo & RequiredFields;

export abstract class WorkspaceFsEntity {
    protected _workspaceFsService: WorkspaceService;
    private _children?: Array<WorkspaceFsEntity>;
    private _details: RequiredObjectInfo;

    constructor(
        protected readonly _apiClient: WorkspaceClient,
        details: ObjectInfo
    ) {
        this._workspaceFsService = _apiClient.workspace;
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

    protected abstract generateUrl(host: URL): Promise<string>;

    get url() {
        return new Promise<string>((resolve) => {
            this._apiClient.apiClient.host.then((host) =>
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
            obj: WorkspaceFsEntity | undefined
        ): obj is WorkspaceFsEntity {
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
        return new Promise<Array<WorkspaceFsEntity>>((resolve) => {
            if (this._children === undefined) {
                this.fetchChildren().then(() => resolve(this._children ?? []));
            } else {
                resolve(this._children);
            }
        });
    }

    @withLogContext(ExposedLoggers.SDK, "WorkspaceFsEntity.fromPath")
    static async fromPath(
        apiClient: WorkspaceClient,
        path: string,
        @context ctx?: Context
    ) {
        try {
            const entity = entityFromObjInfo(
                apiClient,
                await apiClient.workspace.getStatus({path}, ctx)
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

    get parent(): Promise<WorkspaceFsEntity | undefined> {
        const parentPath = posix.dirname(this.path);
        return WorkspaceFsEntity.fromPath(this._apiClient, parentPath);
    }

    get basename(): string {
        return posix.basename(this.path);
    }

    protected abstract _mkdir(
        path: string,
        ctx?: Context
    ): Promise<WorkspaceFsEntity | undefined>;

    @withLogContext(ExposedLoggers.SDK)
    async mkdir(
        path: string,
        @context ctx?: Context
    ): Promise<WorkspaceFsEntity | undefined> {
        return this._mkdir(path, ctx);
    }
}

function entityFromObjInfo(
    apiClient: WorkspaceClient,
    details: ObjectInfo
): WorkspaceFsEntity | undefined {
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
