import {Context} from "../../context";
import {WorkspaceFsEntity} from ".";

export class WorkspaceFsFile extends WorkspaceFsEntity {
    override get children() {
        return Promise.resolve([]);
    }

    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${(await this.parent)?.id ?? ""}`;
    }

    override _mkdir(
        path: string,
        ctx?: Context
    ): Promise<WorkspaceFsEntity | undefined> {
        const err = new Error("Can't create child of a file in workspace");
        ctx?.logger?.error(`Can't create child of ${path}`, err);
        throw err;
    }
}

export class WorkspaceFsNotebook extends WorkspaceFsFile {
    get language() {
        return this.details.language;
    }
}
