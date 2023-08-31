/* eslint-disable @typescript-eslint/naming-convention */
import {posix} from "path";
import {
    workspace,
    WorkspaceClient,
    ApiError,
    logging,
} from "@databricks/databricks-sdk";
import {context, Context} from "@databricks/databricks-sdk/dist/context";

const {ExposedLoggers, withLogContext} = logging;

export class ObjectInfoValidationError extends Error {
    constructor(
        message: string,
        readonly details: workspace.ObjectInfo
    ) {
        super(message);
    }
}

class RequiredFields {
    "object_id" = "";
    "object_type" = "";
    "path" = "";
}

type RequiredObjectInfo = workspace.ObjectInfo & RequiredFields;

export abstract class WorkspaceFsEntity {
    protected _workspaceFsService: workspace.WorkspaceService;
    private _children?: Array<WorkspaceFsEntity>;
    private _details: RequiredObjectInfo;

    constructor(
        protected readonly wsClient: WorkspaceClient,
        details: workspace.ObjectInfo
    ) {
        this._workspaceFsService = wsClient.workspace;
        this._details = this.validateDetails(details);
    }

    @withLogContext(ExposedLoggers.SDK)
    private validateDetails(
        details: workspace.ObjectInfo,
        @context ctx?: Context
    ): RequiredObjectInfo {
        Object.keys(new RequiredFields()).forEach((field) => {
            if (details[field as keyof workspace.ObjectInfo] === undefined) {
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

    set details(details: workspace.ObjectInfo) {
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
            const entity = await entityFromObjInfo(this.wsClient, child);
            if (entity) {
                children.push(entity);
            }
        }

        this._children = children;
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
            if (e instanceof ApiError) {
                if (e.errorCode === "RESOURCE_DOES_NOT_EXIST") {
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
                e instanceof ApiError &&
                e.errorCode === "RESOURCE_DOES_NOT_EXIST"
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

async function entityFromObjInfo(
    wsClient: WorkspaceClient,
    details: workspace.ObjectInfo
) {
    // lazy import to avoid circular dependency
    const {WorkspaceFsDir, WorkspaceFsRepo} = await import("./WorkspaceFsDir");
    const {WorkspaceFsFile, WorkspaceFsNotebook} = await import(
        "./WorkspaceFsFile"
    );

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
