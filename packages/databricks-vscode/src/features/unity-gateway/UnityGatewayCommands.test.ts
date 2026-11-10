import { describe, expect, it, vi } from "vitest";
import { CHOOSE_PROFILE, type ChosenProfile } from "../../kernel/connection/commands";
import type { FeatureCommands } from "../../kernel/feature";
import { UNITY_GATEWAY_SAVED_PROFILE } from "../../kernel/unity-gateway/UnityGatewayService";
import { when } from "../../platform/reactive";
import { UserFacingError } from "../../platform/errors";
import { fakeKernel, fakeLog } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { UnityGatewayCommands } from "./UnityGatewayCommands";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
const tempDir = useTempDirs();

/** The commands the sign-in wizard chooses through: `choice` for the wizard, nothing else. */
function commands(choice: ChosenProfile): FeatureCommands {
    return {
        register() {},
        registerInternal() {},
        async execute<R>(command: { readonly id: string }): Promise<R | undefined> {
            return command.id === CHOOSE_PROFILE.id ? (choice as unknown as R) : undefined;
        },
        async showError() {},
    };
}

describe("UnityGatewayCommands' errors", () => {
    it("keeps a UserFacingError's code and actions in a failed sign-in", async () => {
        const kernel = fakeKernel();
        const action = { title: "Open the configuration file", run: vi.fn() };
        vi.spyOn(kernel.unityGateway, "signIn").mockRejectedValue(
            new UserFacingError("NO_TOKEN", "Profile 'ug' has no token.", { actions: [action] }),
        );
        const signIn = new UnityGatewayCommands(
            kernel.unityGateway,
            commands({ profile: "ug", host: B }),
            kernel.connection.profiles,
            fakeLog(),
        ).signIn();

        await expect(signIn).rejects.toMatchObject({
            name: "UserFacingError",
            code: "NO_TOKEN",
            userMessage: "Error signing in to Unity Gateway. Profile 'ug' has no token.",
            actions: [action],
        });
    });

    it("gives any other sign-in failure the sign-in's code, with the reason", async () => {
        const kernel = fakeKernel();
        vi.spyOn(kernel.unityGateway, "signIn").mockRejectedValue(new Error("boom"));
        const signIn = new UnityGatewayCommands(
            kernel.unityGateway,
            commands({ profile: "ug", host: B }),
            kernel.connection.profiles,
            fakeLog(),
        ).signIn();

        await expect(signIn).rejects.toMatchObject({
            code: "UNITY_GATEWAY_SIGN_IN_FAILED",
            userMessage: "Error signing in to Unity Gateway. boom",
            actions: [],
        });
    });

    it("keeps a UserFacingError's code and actions in a failed sign-out", async () => {
        const kernel = fakeKernel();
        const action = { title: "Open the configuration file", run: vi.fn() };
        vi.spyOn(kernel.unityGateway, "signOut").mockRejectedValue(
            new UserFacingError("STATE_BUSY", "The state is busy.", { actions: [action] }),
        );
        const signOut = new UnityGatewayCommands(
            kernel.unityGateway,
            commands({ profile: "ug", host: B }),
            kernel.connection.profiles,
            fakeLog(),
        ).signOut();

        await expect(signOut).rejects.toMatchObject({
            code: "STATE_BUSY",
            userMessage: "Error signing out of Unity Gateway. The state is busy.",
            actions: [action],
        });
    });
});

/** The commands the wizard is chosen through, recording the focus each choice was made with. */
function recordingCommands(choice: ChosenProfile) {
    const focuses: unknown[] = [];
    const commands: FeatureCommands = {
        register() {},
        registerInternal() {},
        async execute<R>(command: { readonly id: string }, arg?: unknown): Promise<R | undefined> {
            if (command.id !== CHOOSE_PROFILE.id) {
                return undefined;
            }
            focuses.push(arg);
            return choice as unknown as R;
        },
        async showError() {},
    };
    return { commands, focuses };
}

/** The window on profile DEFAULT, on A; Unity Gateway's profile ug is on B. */
function workspaces() {
    const file = tempDir().write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n\n[ug]\nhost = ${B}\ntoken = dapi-ug\n`,
    );
    const httpClient = new FakeHttpClient().on("GET", SCIM_ME, () => ({
        body: { userName: "me" },
    }));
    return fakeKernel({ env: { DATABRICKS_CONFIG_FILE: file }, httpClient });
}

describe("UnityGatewayCommands' wizard focus", () => {
    it("focuses Unity Gateway's host and profile when it is on another workspace than the window", async () => {
        const kernel = workspaces();
        kernel.start();
        await when(kernel.connection.state, (s) => s.status !== "connecting");
        await kernel.unityGateway.signIn("ug");
        const { commands, focuses } = recordingCommands({ profile: "ug", host: B });

        await new UnityGatewayCommands(
            kernel.unityGateway,
            commands,
            kernel.connection.profiles,
            fakeLog(),
        ).signIn();

        expect(kernel.connection.connection?.host).toBe(A);
        expect(focuses).toEqual([{ profile: "ug", host: B, row: "unityGateway" }]);
    });

    it("focuses the profile it saved when it isn't connected", async () => {
        const kernel = workspaces();
        await kernel.state.set(UNITY_GATEWAY_SAVED_PROFILE, {
            profile: "ug",
            host: `${B}/`,
            workspaceId: "222",
        });
        const { commands, focuses } = recordingCommands({ profile: "ug", host: B });

        await new UnityGatewayCommands(
            kernel.unityGateway,
            commands,
            kernel.connection.profiles,
            fakeLog(),
        ).signIn();

        expect(focuses).toEqual([{ profile: "ug", host: `${B}/`, row: "unityGateway" }]);
    });

    it("gives the wizard no host or profile when Unity Gateway has none, so it keeps the window's host", async () => {
        const kernel = workspaces();
        const { commands, focuses } = recordingCommands({ profile: "ug", host: B });

        await new UnityGatewayCommands(
            kernel.unityGateway,
            commands,
            kernel.connection.profiles,
            fakeLog(),
        ).signIn();

        expect(focuses).toEqual([{ row: "unityGateway" }]);
    });
});
