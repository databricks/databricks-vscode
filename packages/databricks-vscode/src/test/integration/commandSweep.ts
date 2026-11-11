/**
 * The command sweep's world: the real features and kernel over the fakes,
 * in the states a window is often in, and a runner that dismisses every
 * prompt a command opens. Used by `commandSweep*.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { FEATURES } from "../../features";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { detectHost, type Host } from "../../kernel/host";
import { MutableState, when } from "../../platform/reactive";
import { installExtensionPack } from "../../test-support/extensionPack";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import {
    SERVERLESS_SESSION_ENV,
    SESSION_REMOTE_NAME,
    SESSION_WORKSPACE_ID,
} from "../../test-support/sessionEnv";
import type { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";

interface Manifest {
    contributes: {
        commands: { command: string }[];
        menus: Record<string, { command?: string; when?: string }[]>;
        viewsWelcome: { contents: string }[];
    };
}

const PACKAGE_DIR = path.resolve(__dirname, "../../..");
const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf-8"),
);
const hiddenFromPalette = new Set(
    manifest.contributes.menus
        .commandPalette!.filter((m) => m.when === "false")
        .map((m) => m.command),
);
const inViewTitles = new Set(
    (manifest.contributes.menus["view/title"] ?? []).map((m) => m.command),
);
const inWelcomeViews = new Set(
    manifest.contributes.viewsWelcome.flatMap((w) =>
        [...w.contents.matchAll(/\(command:([\w.-]+)\)/g)].map((m) => m[1]),
    ),
);
/** What a user can run with no arguments; tree-item and editor menus pass some. */
export const NO_ARGUMENT_COMMANDS = manifest.contributes.commands
    .map((c) => c.command)
    .filter((id) => !hiddenFromPalette.has(id) || inViewTitles.has(id) || inWelcomeViews.has(id));

const HOST = "https://sweep.cloud.databricks.com";
export type Variant =
    | "no folder, no config file"
    | "a folder without a bundle, signed in"
    | "a bundle project, signed in"
    // The other states have none of the extension pack's members, as when they're missing or disabled.
    | "a bundle project, signed in, with the extension pack"
    | "a bundle project, right after activation"
    | "a bundle project, token rejected"
    | "a bundle project, workspace unreachable"
    | "a session window, without a folder"
    | "a session window, with a bundle project"
    | "a session window, with a target in another workspace";

const SESSION_VARIANTS: readonly Variant[] = [
    "a session window, without a folder",
    "a session window, with a bundle project",
    "a session window, with a target in another workspace",
];

/** A session window, as `test-support/sessionEnv.ts` records it, in one of the session variants' states. */
function sessionWorld(variant: Variant, t: ReturnType<ReturnType<typeof useTempDirs>>) {
    const folders: string[] = [];
    if (variant !== "a session window, without a folder") {
        const host =
            variant === "a session window, with a target in another workspace"
                ? ", workspace: {host: https://other.cloud.databricks.com}"
                : "";
        t.write(
            "project/databricks.yml",
            `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development${host}}\n`,
        );
        t.write("project/src/main.py", "print('hi')\n");
        folders.push(t.path("project"));
    }
    return {
        env: { ...SERVERLESS_SESSION_ENV },
        folders,
        host: detectHost(SERVERLESS_SESSION_ENV, { remoteName: SESSION_REMOTE_NAME }),
    };
}

/** The real features over the fake kernel, in one of the variants' states. */
async function world(variant: Variant, tempDir: ReturnType<typeof useTempDirs>) {
    const t = tempDir();
    const http = new FakeHttpClient();
    let env: Record<string, string> = {
        DATABRICKS_CONFIG_FILE: t.path("missing", ".databrickscfg"),
    };
    let folders: string[] = [];
    let host: Host | undefined;
    if (SESSION_VARIANTS.includes(variant)) {
        ({ env, folders, host } = sessionWorld(variant, t));
    } else if (variant !== "no folder, no config file") {
        env = {
            DATABRICKS_CONFIG_FILE: t.write(
                ".databrickscfg",
                `[DEFAULT]\nhost = ${HOST}\ntoken = dapi-sweep\n`,
            ),
        };
        if (variant !== "a folder without a bundle, signed in") {
            t.write(
                "project/databricks.yml",
                `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${HOST}}}\n`,
            );
        }
        t.write("project/src/main.py", "print('hi')\n");
        folders = [t.path("project")];
    }
    if (variant === "a bundle project, token rejected") {
        http.onPrefix("GET", "/", {
            status: 401,
            body: { error_code: "UNAUTHENTICATED", message: "Invalid access token." },
        });
        http.onPrefix("POST", "/", {
            status: 401,
            body: { error_code: "UNAUTHENTICATED", message: "Invalid access token." },
        });
    } else if (variant === "a bundle project, workspace unreachable") {
        const unreachable = () => {
            throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
                code: "ECONNREFUSED",
            });
        };
        http.onPrefix("GET", "/", unreachable);
        http.onPrefix("POST", "/", unreachable);
    } else {
        http.on("GET", SCIM_ME, {
            body: { userName: "me@example.com", id: "1" },
            headers: { "x-databricks-org-id": SESSION_WORKSPACE_ID },
        });
    }
    vscode.folders = folders;
    if (variant === "a bundle project, signed in, with the extension pack") {
        installExtensionPack();
    }
    const kernel = fakeKernel({
        env,
        ...(host !== undefined ? { host } : {}),
        httpClient: http,
        folders: new MutableState<readonly string[]>(folders),
        files: new FakeFileEvents(),
        // The real package, for the resources commands read (stubs, scripts, pages).
        extension: { ...fakeKernel().extension, asAbsolutePath: (p) => path.join(PACKAGE_DIR, p) },
    });
    kernel.runner.on(["bundle", "validate"], () => ({
        stdout: JSON.stringify({
            bundle: { name: "demo", target: "dev", mode: "development" },
            workspace: { host: HOST },
        }),
    }));
    kernel.runner.on(["bundle", "summary"], () => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: "dev" } }),
    }));
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures(FEATURES, fake.host);
    kernel.start();
    startFeatures(registered);
    if (variant !== "a bundle project, right after activation") {
        // Unreachable, the connection check retries with backoff for some seconds.
        await when(kernel.connection.state, (s) => s.status !== "connecting");
        await settle(kernel);
    }
    return {
        kernel,
        log: fake.log,
        registered,
        dispose() {
            for (const { ctx } of registered.toReversed()) {
                ctx.subscriptions.toReversed().forEach((s) => s.dispose());
            }
            kernel.dispose();
        },
    };
}

/** Lets the startup work and its timers run; nothing here waits on a user. */
async function settle(kernel: ReturnType<typeof fakeKernel>) {
    for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 20));
        finishStartedProcesses(kernel);
    }
}

function finishStartedProcesses(kernel: ReturnType<typeof fakeKernel>) {
    for (const process of kernel.runner.started) {
        process.exit(0);
    }
}

/** Dismisses every prompt and lets every process exit, until the command settles or the time is up. */
async function runDismissingPrompts(
    kernel: ReturnType<typeof fakeKernel>,
    id: string,
    timeoutMs = 30_000,
) {
    const command = vscode.commands.get(id);
    if (command === undefined) {
        return { outcome: "not registered" as const };
    }
    const finished = Promise.resolve(command()).then(
        () => "settled" as const,
        () => "settled" as const,
    );
    const deadline = Date.now() + timeoutMs;
    let outcome: "settled" | undefined;
    while (outcome === undefined && Date.now() < deadline) {
        outcome = await Promise.race([
            finished,
            new Promise<undefined>((r) => setTimeout(() => r(undefined), 5)),
        ]);
        for (const input of vscode.quickInputs) {
            if (input.visible) {
                input.hide();
            }
        }
        for (const terminal of vscode.terminals) {
            terminal.close();
        }
        finishStartedProcesses(kernel);
    }
    if (outcome === undefined) {
        vscode.cancelProgress();
        return { outcome: "still running" as const };
    }
    return { outcome };
}

/**
 * Runs every no-argument command in `variant`'s world. Returns what went
 * wrong: commands that crashed or kept running, and features that failed
 * to register or start.
 */
export async function sweep(
    variant: Variant,
    tempDir: ReturnType<typeof useTempDirs>,
): Promise<string[]> {
    const w = await world(variant, tempDir);
    const problems = w.registered
        .filter((r) => r.error !== undefined)
        .map((r) => `${r.feature.id} failed to register`);
    if (
        variant === "a bundle project, right after activation" &&
        w.kernel.connection.state.value.status !== "connecting"
    ) {
        problems.push(
            `the connection was ${w.kernel.connection.state.value.status} before the first command, so nothing ran during startup`,
        );
    }
    for (const id of NO_ARGUMENT_COMMANDS) {
        const errorsBefore = vscode.errors.length;
        const { outcome } = await runDismissingPrompts(w.kernel, id);
        if (outcome !== "settled") {
            problems.push(`${id}: ${outcome}`);
        }
        for (const e of vscode.errors.slice(errorsBefore)) {
            if (e.message.startsWith("Error running command")) {
                problems.push(e.message);
            }
        }
    }
    await settle(w.kernel);
    problems.push(
        ...w.log.entries
            .filter((e) => /failed to (start|register)/.test(e.message))
            .map((e) => e.message),
    );
    w.dispose();
    return problems;
}
