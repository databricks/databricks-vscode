import crypto from "node:crypto";
import { hash } from "bcryptjs";
import type { MetadataTypes } from "./definitions";

/**
 * bcrypt-hashes the user name. The salt is derived from the name, so the hash
 * is stable for a user, and 2^7 rounds (about 13 ms) guard against rainbow
 * tables. Same algorithm as the old extension, so hashes stay comparable.
 */
async function hashUserName(userName: string): Promise<string> {
    const salt = crypto.createHash("sha256").update(userName).digest("hex").substring(0, 22);
    return hash(userName, `$2b$07$${salt}`);
}

export async function toUserMetadata(user: {
    userName: string;
    host: string;
    workspaceId?: string;
    authType?: string;
}): Promise<Partial<MetadataTypes["user"]>> {
    return {
        hashedUserName: await hashUserName(user.userName),
        host: user.host,
        ...(user.workspaceId !== undefined ? { workspaceId: user.workspaceId } : {}),
        ...(user.authType !== undefined ? { authType: user.authType } : {}),
    };
}
