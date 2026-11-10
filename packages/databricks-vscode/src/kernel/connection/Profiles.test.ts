import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    inferAuthType,
    Profiles,
    readDefaultProfileSetting,
    readProfiles,
    resolveConfigFile,
} from "./Profiles";

const dirs: string[] = [];
function configFile(content?: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profiles-"));
    dirs.push(dir);
    const file = path.join(dir, ".databrickscfg");
    if (content !== undefined) {
        fs.writeFileSync(file, content);
    }
    return file;
}
afterEach(() => {
    for (const dir of dirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe("resolveConfigFile (AUTH-07)", () => {
    it("prefers the setting, then DATABRICKS_CONFIG_FILE, then ~/.databrickscfg", () => {
        // Normalized for the OS, as the file is opened.
        expect(resolveConfigFile("/s/cfg", { DATABRICKS_CONFIG_FILE: "/e/cfg" }, "/home/me")).toBe(
            path.normalize("/s/cfg"),
        );
        expect(resolveConfigFile("", { DATABRICKS_CONFIG_FILE: "/e/cfg" }, "/home/me")).toBe(
            path.normalize("/e/cfg"),
        );
        expect(resolveConfigFile(undefined, {}, "/home/me")).toBe(
            path.join("/home/me", ".databrickscfg"),
        );
    });

    it("expands a leading ~/", () => {
        expect(resolveConfigFile("~/x/.databrickscfg", {}, "/home/me")).toBe(
            path.join("/home/me", "x", ".databrickscfg"),
        );
    });
});

describe("readProfiles", () => {
    it("reads every profile from the file, with the auth type it implies", async () => {
        const file = configFile(
            [
                "[DEFAULT]",
                "host = https://a.cloud.databricks.com/",
                "token = dapi-1",
                "",
                "[sp]",
                "host = https://a.cloud.databricks.com",
                "client_id = id",
                "client_secret = secret",
                "",
                "[u2m]",
                "host = https://u.databricks.com",
                "workspace_id = 42",
                "auth_type = databricks-cli",
                "serverless_compute_id = auto",
                "",
                "[__settings__]",
                "default_profile = u2m",
            ].join("\n"),
        );
        const snapshot = await readProfiles(file);
        expect(snapshot.exists).toBe(true);
        expect(snapshot.defaultProfile).toBe("u2m");
        expect(snapshot.profiles.map((p) => [p.name, p.host, p.authType, p.workspaceId])).toEqual([
            ["DEFAULT", "https://a.cloud.databricks.com", "pat", undefined],
            ["sp", "https://a.cloud.databricks.com", "oauth-m2m", undefined],
            ["u2m", "https://u.databricks.com", "databricks-cli", "42"],
        ]);
        expect(snapshot.profiles[2]!.profile.extra).toEqual({ serverless_compute_id: "auto" });
        // Secrets don't leak through string conversion.
        expect(JSON.stringify(snapshot.profiles[0]!.profile)).not.toContain("dapi-1");
    });

    it("ignores the environment, so ambient variables can't override a profile", async () => {
        const file = configFile(
            "[DEFAULT]\nhost = https://a.cloud.databricks.com\ntoken = file-token\n",
        );
        process.env.DATABRICKS_TOKEN = "ambient";
        try {
            const snapshot = await readProfiles(file);
            expect(snapshot.profiles[0]!.profile.token?.value).toBe("file-token");
        } finally {
            delete process.env.DATABRICKS_TOKEN;
        }
    });

    it("is empty when the file doesn't exist, and skips an empty DEFAULT", async () => {
        expect(await readProfiles(configFile())).toMatchObject({ exists: false, profiles: [] });
        expect((await readProfiles(configFile("[DEFAULT]\n"))).profiles).toEqual([]);
    });
});

describe("readDefaultProfileSetting", () => {
    it("reads default_profile from [__settings__] only", () => {
        expect(
            readDefaultProfileSetting(
                "[a]\ndefault_profile = no\n[__settings__]\ndefault_profile = yes ; comment\n",
            ),
        ).toBe("yes");
        expect(
            readDefaultProfileSetting("[__settings__]\nauth_storage = plaintext\n"),
        ).toBeUndefined();
    });
});

describe("inferAuthType", () => {
    it("follows the SDK's default chain", () => {
        expect(inferAuthType({ authType: "azure-cli", token: undefined })).toBe("azure-cli");
        expect(inferAuthType({ host: "h", clientId: "a" })).toBe("databricks-cli");
        expect(inferAuthType({ extra: { google_service_account: "x" }, host: "h" })).toBe(
            "google-id",
        );
        expect(inferAuthType({})).toBeUndefined();
    });
});

describe("Profiles", () => {
    it("reloads when the watched file changes", async () => {
        const file = configFile("[a]\nhost = https://a.cloud.databricks.com\ntoken = t\n");
        let fire: (() => void) | undefined;
        const profiles = new Profiles(
            () => file,
            (_f, onChange) => {
                fire = onChange;
                return { dispose: () => (fire = undefined) };
            },
        );
        profiles.start();
        await profiles.snapshot.settled();
        fs.appendFileSync(file, "[b]\nhost = https://b.cloud.databricks.com\ntoken = t\n");
        fire?.();
        const state = await profiles.snapshot.settled();
        expect(state.status === "ready" && state.value.profiles.map((p) => p.name)).toEqual([
            "a",
            "b",
        ]);
        profiles.dispose();
        expect(fire).toBeUndefined();
    });

    describe("debounce", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        /** Profiles over a fake file: `reads` counts the reads, `fire` is the watcher's event. */
        function counted() {
            vi.useFakeTimers();
            const watcher: { fire?: () => void } = {};
            const counts = { reads: 0 };
            const profiles = new Profiles(
                () => "/config",
                (_f, onChange) => {
                    watcher.fire = onChange;
                    return { dispose: () => (watcher.fire = undefined) };
                },
                async (configFile) => {
                    counts.reads++;
                    return { configFile, exists: true, profiles: [] };
                },
            );
            return { profiles, counts, watcher };
        }

        it("reads the file at start at once", async () => {
            const { profiles, counts } = counted();
            profiles.start();
            expect(counts.reads).toBe(1);
            expect((await profiles.snapshot.settled()).status).toBe("ready");
            profiles.dispose();
        });

        it("reads the file at once when the sign-in wizard refreshes it, even after a change", async () => {
            const { profiles, counts, watcher } = counted();
            profiles.start();
            await profiles.snapshot.settled();
            watcher.fire?.();
            const refreshed = profiles.refresh("sign-in wizard");
            expect(counts.reads).toBe(2);
            expect((await refreshed).exists).toBe(true);
            // The change's debounced read was superseded by the wizard's.
            await vi.advanceTimersByTimeAsync(250);
            expect(counts.reads).toBe(2);
            profiles.dispose();
        });

        it("reads a burst of file changes once, after it", async () => {
            const { profiles, counts, watcher } = counted();
            profiles.start();
            await profiles.snapshot.settled();
            for (let i = 0; i < 5; i++) {
                watcher.fire?.();
                await vi.advanceTimersByTimeAsync(50);
            }
            expect(counts.reads).toBe(1);
            await vi.advanceTimersByTimeAsync(200);
            expect(counts.reads).toBe(2);
            profiles.dispose();
        });
    });
});
