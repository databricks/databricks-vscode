import {WorkspaceFsEntity} from ".";

export class WorkspaceFsFile extends WorkspaceFsEntity {
    override get children() {
        return Promise.resolve([]);
    }

    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${(await this.parent)?.id ?? ""}`;
    }
}

export class WorkspaceFsNotebook extends WorkspaceFsFile {
    get language() {
        return this.details.language;
    }
}
