import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listProfiles, resolve, type Profile } from "@databricks/sdk-core/profiles";
import type { Disposable } from "../../platform/event";
import { Resource } from "../../platform/reactive";
import { setting } from "../../platform/settings";
import { hostKey } from "./hostMatching";

/** AUTH-07: the old setting, which wins over `DATABRICKS_CONFIG_FILE`. */
export const OVERRIDE_CONFIG_FILE = setting<string>(
    "databricks",
    "overrideDatabricksConfigFile",
    "",
);

/**
 * The config file, by the AUTH-07 precedence: the setting, then
 * `DATABRICKS_CONFIG_FILE`, then `~/.databrickscfg`. A leading `~/` expands.
 */
export function resolveConfigFile(
    settingValue: string | undefined,
    env: Readonly<Record<string, string | undefined>>,
    homedir: string = env.HOME ?? os.homedir(),
): string {
    let file = settingValue || env.DATABRICKS_CONFIG_FILE || path.join(homedir, ".databrickscfg");
    if (file.startsWith("~/")) {
        file = path.join(homedir, file.slice(2));
    }
    return path.normalize(file);
}

/** A profile as the extension sees it. Secrets stay in `profile`. */
export interface ProfileInfo {
    readonly name: string;
    /** Normalised, or undefined when the profile has no valid host. */
    readonly host?: string;
    readonly workspaceId?: string;
    readonly accountId?: string;
    /** `auth_type`, or what the credential fields imply (`inferAuthType`). */
    readonly authType?: string;
    /** The resolved profile, from the config file only. */
    readonly profile: Profile;
}

export interface ProfilesSnapshot {
    readonly configFile: string;
    readonly exists: boolean;
    readonly profiles: readonly ProfileInfo[];
    /** `[__settings__] default_profile`. */
    readonly defaultProfile?: string;
}

/**
 * The auth type a profile uses: `auth_type` when set, else what its fields
 * imply, in the order of the SDK's default chain (PAT, M2M, then the CLI).
 */
export function inferAuthType(profile: Profile): string | undefined {
    if (profile.authType) {
        return profile.authType;
    }
    if (profile.token) {
        return "pat";
    }
    if (profile.clientId && profile.clientSecret) {
        return "oauth-m2m";
    }
    const extra = profile.extra ?? {};
    if (extra.azure_client_secret) {
        return "azure-client-secret";
    }
    if (extra.google_service_account || extra.google_credentials) {
        return "google-id";
    }
    if (profile.host) {
        return "databricks-cli";
    }
    return undefined;
}

/**
 * `[__settings__] default_profile`. The SDK applies it only together with
 * `DATABRICKS_CONFIG_PROFILE` from the process environment, and the resolver
 * needs the two separately, so it is read here.
 */
export function readDefaultProfileSetting(content: string): string | undefined {
    let inSettings = false;
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith("[")) {
            inSettings = line.slice(1, line.lastIndexOf("]")) === "__settings__";
            continue;
        }
        if (!inSettings || line === "" || line.startsWith("#") || line.startsWith(";")) {
            continue;
        }
        const match = /^default_profile\s*[=:]\s*(.*)$/.exec(line);
        if (match) {
            const value = match[1]!.replace(/\s[#;].*$/, "").trim();
            return value === "" ? undefined : value;
        }
    }
    return undefined;
}

/** Reads every profile from the config file only: never the environment. */
export async function readProfiles(configFile: string): Promise<ProfilesSnapshot> {
    let content: string;
    try {
        content = await readFile(configFile, "utf8");
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            return { configFile, exists: false, profiles: [] };
        }
        throw e;
    }
    const names = await listProfiles(configFile);
    const profiles = await Promise.all(
        names.map(async (name): Promise<ProfileInfo> => {
            const profile = await resolve({ profile: name, configFile, disableEnv: true });
            return {
                name,
                host: hostKey(profile.host),
                workspaceId: profile.workspaceId,
                accountId: profile.accountId,
                authType: inferAuthType(profile),
                profile,
            };
        }),
    );
    return {
        configFile,
        exists: true,
        profiles,
        defaultProfile: readDefaultProfileSetting(content),
    };
}

/** Watches one file, which may not exist yet. */
export type FileWatcher = (file: string, onChange: () => void) => Disposable;

/**
 * The profiles in the config file (refreshed when the file changes,
 * debounced, and when the wizard opens). The CLI writes the file; the
 * extension only reads it. The first read and explicit refreshes don't wait
 * for the debounce, which coalesces the file's changes.
 */
export class Profiles {
    readonly snapshot: Resource<ProfilesSnapshot>;
    private watcher?: Disposable;
    private watchedFile?: string;

    constructor(
        private readonly configFile: () => string,
        private readonly watch: FileWatcher,
        read: (configFile: string) => Promise<ProfilesSnapshot> = readProfiles,
    ) {
        this.snapshot = new Resource(() => read(this.configFile()), { debounceMs: 200 });
    }

    /** Starts watching and loads. Call from `start`, not while registering. */
    start(): void {
        this.rewatch();
        void this.snapshot.refresh("start");
    }

    /** Re-reads the file, for example after the CLI wrote a profile. */
    async refresh(reason: string): Promise<ProfilesSnapshot> {
        this.rewatch();
        const state = await this.snapshot.refresh(reason);
        if (state.status === "error") {
            throw state.error;
        }
        if (state.status !== "ready") {
            throw new Error("The profiles didn't load");
        }
        return state.value;
    }

    private rewatch() {
        const file = this.configFile();
        if (file === this.watchedFile) {
            return;
        }
        this.watcher?.dispose();
        this.watchedFile = file;
        this.watcher = this.watch(file, () => this.snapshot.invalidate("config file changed"));
    }

    dispose(): void {
        this.watcher?.dispose();
        this.snapshot.dispose();
    }
}
