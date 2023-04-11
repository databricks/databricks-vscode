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
        protected readonly wsClient: WorkspaceClient,
        details: ObjectInfo
    ) {
        this._workspaceFsService = wsClient.workspace;
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
            this.wsClient.apiClient.host.then((host) =>
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
        const children: Array<WorkspaceFsEntity> = [];

        for await (const child of this._workspaceFsService.list({
            path: this.path,
        })) {
            const entity = entityFromObjInfo(this.wsClient, child);
            if (entity) {
                children.push(entity);
            }
        }
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
        wsClient: WorkspaceClient,
        path: string,
        @context ctx?: Context
    ) {
        try {
            const entity = entityFromObjInfo(
                wsClient,
                await wsClient.workspace.getStatus({path}, ctx)
            );
            return entity;
        } catch (e) {
            if (
                e instanceof Error &&
                e.message.includes("RESOURCE_DOES_NOT_EXIST")
            ) {
                return undefined;
            }

            throw e;
        }
    }

    get parent(): Promise<WorkspaceFsEntity | undefined> {
        const parentPath = posix.dirname(this.path);
        return WorkspaceFsEntity.fromPath(this.wsClient, parentPath);
    }

    get basename(): string {
        return posix.basename(this.path);
    }
}

function entityFromObjInfo(wsClient: WorkspaceClient, details: ObjectInfo) {
    switch (details.object_type) {
        case "DIRECTORY":
            return new WorkspaceFsDir(wsClient, details);
        case "REPO":
            return new WorkspaceFsRepo(wsClient, details);
        case "FILE":
            return new WorkspaceFsFile(wsClient, details);
        case "NOTEBOOK":
            return new WorkspaceFsNotebook(wsClient, details);
    }
    return undefined;
}
