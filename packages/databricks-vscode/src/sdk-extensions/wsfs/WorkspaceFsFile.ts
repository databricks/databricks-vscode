import {WorkspaceFsEntity} from "./WorkspaceFsEntity";

export class WorkspaceFsFile extends WorkspaceFsEntity {
    override get children() {
        return Promise.resolve([]);
    }

    override async generateUrl(host: URL): Promise<string> {
        return `${host.host}#folder/${(await this.parent)?.id ?? ""}`;
    }

    async readContent(): Promise<Uint8Array> {
        const result = await this._workspaceFsService.export({
            path: this.path,
            format: "AUTO",
        });
        return Buffer.from(result.content ?? "", "base64");
    }
}

export class WorkspaceFsNotebook extends WorkspaceFsFile {
    get language() {
        return this.details.language;
    }
}
