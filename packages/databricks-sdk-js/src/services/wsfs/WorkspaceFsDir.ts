import {posix} from "path";
import {ApiClientResponseError} from "../../api-client";
import {Context, context} from "../../context";
import {WorkspaceFsEntity} from ".";
import {ExposedLoggers, withLogContext} from "../../logging";
import {isDirectory, isFile} from "./utils";

export class WorkspaceFsDir extends WorkspaceFsEntity {
    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${this.details.object_id}`;
    }

    public getAbsoluteChildPath(path: string) {
        //Since this.path returns path value from details returned by the API,
        //it is always absolute. So we can directly use it here.
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

    @withLogContext(ExposedLoggers.SDK)
    async mkdir(path: string, @context ctx?: Context) {
        const validPath = this.getAbsoluteChildPath(path);
        if (!validPath) {
            const err = new Error(
                `Can't create ${path} as child of ${this.path}: Invalid path`
            );
            ctx?.logger?.error(
                `Can't create ${path} as child of ${this.path}`,
                err
            );
            throw err;
        }

        try {
            await this._workspaceFsService.mkdirs({path: validPath});
        } catch (e: unknown) {
            let err: any = e;
            if (e instanceof Error) {
                if (e.message.includes("RESOURCE_ALREADY_EXISTS")) {
                    err = new Error(
                        `Can't create ${path} as child of ${this.path}: A file with same path exists`
                    );
                }
            }
            ctx?.logger?.error(
                `Can't create ${path} as child of ${this.path}`,
                err
            );
            throw err;
        }

        const entity = await WorkspaceFsEntity.fromPath(
            this.wsClient,
            validPath,
            ctx
        );
        if (isDirectory(entity)) {
            return entity;
        }

        return undefined;
    }

    @withLogContext(ExposedLoggers.SDK)
    async createFile(
        path: string,
        content: string,
        overwrite = true,
        @context ctx?: Context
    ) {
        const validPath = this.getAbsoluteChildPath(path);
        if (!validPath) {
            const err = new Error(
                `Can't create ${path} as child of ${this.path}: Invalid path`
            );
            ctx?.logger?.error(
                `Can't create ${path} as child of ${this.path}`,
                err
            );
            throw err;
        }

        try {
            await this._workspaceFsService.import(
                {
                    path: validPath,
                    overwrite,
                    format: "AUTO",
                    content: Buffer.from(content).toString("base64"),
                },
                ctx
            );
        } catch (e) {
            ctx?.logger?.error("Error writing ${validPath} file", e);
            throw e;
        }

        let entity = await WorkspaceFsEntity.fromPath(
            this.wsClient,
            validPath,
            ctx
        );

        if (entity === undefined) {
            //try to read notebook
            entity = await WorkspaceFsEntity.fromPath(
                this.wsClient,
                validPath.replace(/^(\/.*)\.(py|ipynb|scala|r|sql)/g, "$1"),
                ctx
            );
        }

        if (isFile(entity)) {
            return entity;
        }
    }
}

export class WorkspaceFsRepo extends WorkspaceFsDir {}
