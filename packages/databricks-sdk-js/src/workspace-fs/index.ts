import {ObjectInfoObjectType} from "../apis/workspace";

export interface IWorkspaceFsEntity {
    children: Promise<Array<IWorkspaceFsEntity>>;
    url: Promise<string>;
    path: string;
    type: ObjectInfoObjectType;
    id: string;
    parent: Promise<IWorkspaceFsEntity | undefined>;
}

export * from "./entities";
