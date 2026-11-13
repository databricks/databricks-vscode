import crypto from "node:crypto";
import { hashSync } from "bcryptjs";
import type { MetadataTypes } from "./definitions";

// Cached, so a repeat connect as the same user doesn't block on the hash again.
const hashedUserNames = new Map<string, string>();

/**
 * bcrypt-hashes the user name. The salt is derived from the name, so the hash
 * is stable for a user, and 2^7 rounds (about 13 ms) guard against rainbow
 * tables. Same algorithm as the old extension, so hashes stay comparable.
 * Synchronous, so the user is set before the same change's events are
 * recorded; cached, so each name is hashed once per session.
 */
function hashUserName(userName: string): string {
    let hashed = hashedUserNames.get(userName);
    if (hashed === undefined) {
        const salt = crypto.createHash("sha256").update(userName).digest("hex").substring(0, 22);
        hashed = hashSync(userName, `$2b$07$${salt}`);
        hashedUserNames.set(userName, hashed);
    }
    return hashed;
}

export function toUserMetadata(user: {
    userName: string;
    host: string;
    workspaceId?: string;
    authType?: string;
}): Partial<MetadataTypes["user"]> {
    return {
        hashedUserName: hashUserName(user.userName),
        host: user.host,
        ...(user.workspaceId !== undefined ? { workspaceId: user.workspaceId } : {}),
        ...(user.authType !== undefined ? { authType: user.authType } : {}),
    };
}
