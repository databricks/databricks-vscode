import type { Event } from "vscode";
import { hostKey, isSpogHost, normalizeHost, type Connection } from "../../kernel/connection";
import { stateKey, type StateStore } from "../../platform/state";
import { favoriteKey, favoriteRef, type PinnableNode, type StoredFavoriteRef } from "./types";

/** The old key: one list per VS Code workspace, whatever the host. Read, never written. */
export const LEGACY_FAVORITES = stateKey<StoredFavoriteRef[] | undefined>(
    "databricks.unityCatalog.favorites",
    "workspace",
    undefined,
);

/** UC-03: the favorites of each workspace host, shared by every window. */
export const FAVORITES = stateKey<Record<string, StoredFavoriteRef[]>>(
    "databricks.unityCatalog.favoritesByHost",
    "global",
    {},
);

/** Set once this VS Code workspace's old list has been copied, so unpinning everything doesn't bring it back. */
export const LEGACY_FAVORITES_COPIED = stateKey<boolean>(
    "databricks.unityCatalog.favoritesCopied",
    "workspace",
    false,
);

/**
 * The key of a connection's favorites: the normalised host. A unified host
 * serves many workspaces, so there the workspace ID is part of it.
 */
export function favoritesKey(connection: Pick<Connection, "host" | "workspaceId">): string {
    const host = hostKey(connection.host) ?? connection.host;
    let spog = false;
    try {
        spog = isSpogHost(normalizeHost(connection.host));
    } catch {
        // an invalid host is its own key
    }
    return spog && connection.workspaceId !== undefined
        ? `${host}?o=${connection.workspaceId}`
        : host;
}

/** Pinned securables for one workspace. */
export class Favorites {
    private readonly host: string;

    constructor(
        private readonly state: StateStore,
        connection: Pick<Connection, "host" | "workspaceId">,
    ) {
        this.host = favoritesKey(connection);
    }

    get onDidChange(): Event<void> {
        return this.state.onDidChange(FAVORITES);
    }

    list(): StoredFavoriteRef[] {
        return this.state.get(FAVORITES)[this.host] ?? [];
    }

    has(node: PinnableNode): boolean {
        const key = favoriteKey(favoriteRef(node));
        return this.list().some((f) => favoriteKey(f) === key);
    }

    /** Adds the node at the end. False if it was pinned already. */
    async pin(node: PinnableNode): Promise<boolean> {
        const ref = favoriteRef(node);
        const favorites = this.list();
        if (favorites.some((f) => favoriteKey(f) === favoriteKey(ref))) {
            return false;
        }
        await this.write([...favorites, ref]);
        return true;
    }

    /** False if it wasn't pinned. */
    async unpin(node: PinnableNode): Promise<boolean> {
        const key = favoriteKey(favoriteRef(node));
        const favorites = this.list();
        const updated = favorites.filter((f) => favoriteKey(f) !== key);
        if (updated.length === favorites.length) {
            return false;
        }
        await this.write(updated);
        return true;
    }

    /** Drops refs to securables that no longer exist. */
    async forget(gone: readonly StoredFavoriteRef[]): Promise<void> {
        const keys = new Set(gone.map(favoriteKey));
        const favorites = this.list();
        const updated = favorites.filter((f) => !keys.has(favoriteKey(f)));
        if (updated.length !== favorites.length) {
            await this.write(updated);
        }
    }

    /**
     * Copies this VS Code workspace's old favorites to the host it connects
     * to first, once (copied, never moved). Refs the host
     * already has aren't added twice. The old key keeps its value, so the old
     * extension still finds it.
     */
    async copyLegacy(): Promise<void> {
        if (this.state.get(LEGACY_FAVORITES_COPIED)) {
            return;
        }
        const legacy = this.state.get(LEGACY_FAVORITES) ?? [];
        if (legacy.length > 0) {
            const favorites = this.list();
            const keys = new Set(favorites.map(favoriteKey));
            const added = legacy.filter((ref) => isRef(ref) && !keys.has(favoriteKey(ref)));
            if (added.length > 0) {
                await this.write([...favorites, ...added]);
            }
        }
        await this.state.set(LEGACY_FAVORITES_COPIED, true);
    }

    private async write(refs: StoredFavoriteRef[]) {
        const all = this.state.get(FAVORITES);
        if (refs.length === 0) {
            delete all[this.host];
        } else {
            all[this.host] = refs;
        }
        await this.state.set(FAVORITES, all);
    }
}

/** The old list was written by the old extension; skip anything that isn't a ref. */
function isRef(value: unknown): value is StoredFavoriteRef {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const ref = value as { kind?: unknown; fullName?: unknown; version?: unknown };
    if (typeof ref.fullName !== "string") {
        return false;
    }
    if (ref.kind === "modelVersion") {
        return typeof ref.version === "number";
    }
    return ["catalog", "schema", "table", "volume", "function", "registeredModel"].includes(
        ref.kind as string,
    );
}
