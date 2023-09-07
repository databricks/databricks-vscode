import {WorkspaceFsEntity} from "./WorkspaceFsEntity";
import {WorkspaceFsDir, WorkspaceFsRepo} from "./WorkspaceFsDir";
import {WorkspaceFsFile, WorkspaceFsNotebook} from "./WorkspaceFsFile";

export function isDirectory(
    entity?: WorkspaceFsEntity
): entity is WorkspaceFsDir {
    if (entity?.type === "DIRECTORY" || entity?.type === "REPO") {
        return true;
    }
    return false;
}

export function isRepo(entity?: WorkspaceFsEntity): entity is WorkspaceFsRepo {
    if (entity?.type === "REPO") {
        return true;
    }
    return false;
}

export function isFile(entity?: WorkspaceFsEntity): entity is WorkspaceFsFile {
    if (entity?.type === "FILE" || entity?.type === "NOTEBOOK") {
        return true;
    }
    return false;
}

export function isNotebook(
    entity?: WorkspaceFsEntity
): entity is WorkspaceFsNotebook {
    if (entity?.type === "NOTEBOOK") {
        return true;
    }
    return false;
}
