import {posix} from "path";
import {ApiClientResponseError} from "../../api-client";
import {Context} from "../../context";
import {WorkspaceFsEntity} from ".";

export class WorkspaceFsDir extends WorkspaceFsEntity {
    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${this.details.object_id}`;
    }

    public getAbsoluteChildPath(path: string) {
        const resolved = posix.resolve(this.path, path);
        const relative = posix.relative(this.path, resolved);

        if (
            !posix.isAbsolute(relative) &&
            !relative.startsWith(".." + posix.sep) &&
            relative !== ".."
        ) {
            return resolved;
        }

        return undefined;
    }

    protected override async _mkdir(
        path: string,
        ctx?: Context
    ): Promise<WorkspaceFsEntity | undefined> {
        const validPath = this.getAbsoluteChildPath(path);
        if (!validPath) {
            const err = new Error(
                `Can't create ${path} as child of ${this.path}: Invalid path`
            );
            ctx?.logger?.error(`Can't create child of ${path}`, err);
            throw err;
        }

        try {
            await this._workspaceFsService.mkdirs({path: validPath});
        } catch (e: unknown) {
            let err: any = e;
            if (e instanceof ApiClientResponseError) {
                if (e.error_code === "RESOURCE_ALREADY_EXISTS") {
                    err = new Error(
                        `Can't create ${path} as child of ${this.path}: A file with same path exists`
                    );
                }
            }
            ctx?.logger?.error(`Can't create child of ${path}`, err);
            throw err;
        }

        return await WorkspaceFsEntity.fromPath(this.wsClient, validPath, ctx);
    }
}

export class WorkspaceFsRepo extends WorkspaceFsDir {}
