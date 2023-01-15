import {ObjectType} from "../apis/workspace";

export interface IWorkspaceFsEntity {
    children: Promise<Array<IWorkspaceFsEntity>>;
    url: Promise<string>;
    path: string;
    type: ObjectType;
    id: string;
    parent: Promise<IWorkspaceFsEntity | undefined>;
}

export * from "./entities";
