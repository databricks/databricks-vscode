import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { StateStore } from "../../platform/state";
import { when } from "../../platform/reactive";
import { fakeLog, fakeMemento } from "../../test-support/fakes";
import { HostMetadataCache } from "./hostMetadata";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { ConnectionService, type ConnectionState } from "./ConnectionService";
import { Profiles, readProfiles } from "./Profiles";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
const tempDir = useTempDirs();

/**
 * The connection over a real config file, read by the real reader. The
 * watcher is the test's: `changed()` is what the poller does when the
 * file's size or mtime changes.
 */
function setup(options: { content?: string; http?: FakeHttpClient } = {}) {
    const dir = tempDir();
    const file = dir.path(".databrickscfg");
    if (options.content !== undefined) {
        fs.writeFileSync(file, options.content);
    }
    let onChange: () => void = () => {};
    const reads: string[] = [];
    const profiles = new Profiles(
        () => file,
        (_file, listener) => {
            onChange = listener;
            return { dispose: () => {} };
        },
        (f) => {
            reads.push(f);
            return readProfiles(f);
        },
    );
    const http =
        options.http ??
        new FakeHttpClient().on("GET", SCIM_ME, (req) => ({
            body: { userName: `${new URL(req.url).host} ${req.headers.get("Authorization")}` },
        }));
    const service = new ConnectionService({
        profiles,
        hostMetadata: new HostMetadataCache(http),
        state: new StateStore({ global: fakeMemento(), workspace: fakeMemento() }),
        env: {},
        identity: { kind: "profiles" },
        sources: {
            u2mToken: async () => ({ value: "u2m" }),
            azureCliToken: async () => ({ value: "az" }),
        },
        log: fakeLog(),
        httpClient: http,
    });
    const settle = () => when(service.state, (s) => s.status !== "connecting");
    const write = (content: string) => {
        fs.writeFileSync(file, content);
        onChange();
    };
    return { service, http, file, reads, settle, write, changed: () => onChange() };
}

const summary = (s: ConnectionState) =>
    s.status === "connected"
        ? `connected ${s.connection.profile} ${s.connection.host}`
        : s.status === "signedOut"
          ? `signedOut: ${s.reason}`
          : s.status === "error"
            ? `error: ${s.error.message}`
            : s.status;

describe("the connection when the config file changes", () => {
    it("connects once the CLI creates the config file after activation (first run)", async () => {
        const { service, settle, write } = setup();
        service.start();
        expect(summary(await settle())).toBe("signedOut: No profile is selected.");

        write(`[DEFAULT]\nhost = ${A}\ntoken = dapi-new\n`);
        await vi.waitFor(() => expect(service.state.value.status).toBe("connected"));
        expect(summary(service.state.value)).toBe(`connected DEFAULT ${A}`);
    });

    it("signs out when the config file is deleted while connected", async () => {
        const { service, settle, file, changed } = setup({
            content: `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n`,
        });
        service.start();
        expect(summary(await settle())).toBe(`connected DEFAULT ${A}`);

        fs.rmSync(file);
        changed();
        await vi.waitFor(() => expect(service.state.value.status).toBe("signedOut"));
        expect(summary(service.state.value)).toBe("signedOut: No profile is selected.");
        expect(service.connection).toBeUndefined();
    });

    it("reads the file and reconnects once for a burst of edits", async () => {
        const { service, settle, http, reads, write } = setup({
            content: `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n`,
        });
        service.start();
        await settle();
        expect(reads).toHaveLength(1);
        expect(http.to(new URL(SCIM_ME, A).pathname)).toHaveLength(1);

        // An editor saving several times in quick succession, ending on host B.
        write(`[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n# edited\n`);
        write(`[DEFAULT]\nhost = ${B}\ntoken = dapi-a\n`);
        write(`[DEFAULT]\nhost = ${B}\ntoken = dapi-b\n`);
        await vi.waitFor(() => expect(summary(service.state.value)).toBe(`connected DEFAULT ${B}`));
        expect(reads).toHaveLength(2);
        expect(
            http.requests.map((r) => `${new URL(r.url).host} ${r.headers.get("Authorization")}`),
        ).toEqual(["a.cloud.databricks.com Bearer dapi-a", "b.cloud.databricks.com Bearer dapi-b"]);
    });

    it("doesn't reconnect when an edit leaves the connected profile as it was", async () => {
        const { service, settle, http, reads, write } = setup({
            content: `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n`,
        });
        service.start();
        await settle();
        const before = service.connection;

        // A comment and another profile; DEFAULT's own lines are unchanged.
        write(
            `; a comment\n[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n\n[other]\nhost = ${B}\ntoken = dapi-o\n`,
        );
        await vi.waitFor(() => expect(reads).toHaveLength(2));
        // The service resolves once the snapshot settles; a reconnect would have started by the next task.
        await service.profiles.snapshot.settled();
        await new Promise((r) => setTimeout(r, 0));
        await settle();
        expect(http.requests).toHaveLength(1);
        // The same clients: the connection may be re-announced with its reason, but not rebuilt.
        expect(service.connection?.api).toBe(before?.api);
    });

    it("lets the edited host win over a connection attempt still in flight for the old one", async () => {
        let releaseA!: () => void;
        const gateA = new Promise<void>((r) => (releaseA = r));
        const http = new FakeHttpClient().on("GET", SCIM_ME, async (req) => {
            const host = new URL(req.url).host;
            if (host === "a.cloud.databricks.com") {
                await gateA;
            }
            return { body: { userName: host } };
        });
        const { service, write } = setup({
            content: `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n`,
            http,
        });
        service.start();
        await vi.waitFor(() => expect(http.requests).toHaveLength(1));
        expect(service.state.value).toMatchObject({ status: "connecting", host: A });

        write(`[DEFAULT]\nhost = ${B}\ntoken = dapi-b\n`);
        await vi.waitFor(() => expect(summary(service.state.value)).toBe(`connected DEFAULT ${B}`));
        // The old attempt's late answer arrives after the new connection.
        releaseA();
        await new Promise((r) => setTimeout(r, 20));
        expect(summary(service.state.value)).toBe(`connected DEFAULT ${B}`);
        expect(service.connection?.userName).toBe("b.cloud.databricks.com");
    });

    it("stays signed out when sign-out happens during a connection attempt", async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const http = new FakeHttpClient().on("GET", SCIM_ME, async () => {
            await gate;
            return { body: { userName: "late" } };
        });
        const { service } = setup({ content: `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n`, http });
        service.start();
        await vi.waitFor(() => expect(http.requests).toHaveLength(1));

        await service.signOut();
        release();
        await new Promise((r) => setTimeout(r, 20));
        expect(service.state.value).toMatchObject({
            status: "signedOut",
            reason: "You signed out.",
            hint: { host: A, profile: "DEFAULT" },
        });
        // The aborted attempt was really aborted, not only ignored.
        expect(http.requests[0]!.signal?.aborted).toBe(true);
    });
});
