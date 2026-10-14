import assert from "assert";
import {anything, instance, mock, verify} from "ts-mockito";
import {CliWrapper} from "../cli/CliWrapper";
import {
    AuthProvider,
    DatabricksCliAuthProvider,
    ProfileAuthProvider,
} from "../configuration/auth/AuthProvider";
import {UnityGatewayCommands} from "./UnityGatewayCommands";
import {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";

describe(__filename, () => {
    let connectionManager: UnityGatewayConnectionManager;

    beforeEach(() => {
        connectionManager = mock(UnityGatewayConnectionManager);
    });

    function createCommands(
        wizardResult: AuthProvider | undefined,
        enabled = true
    ) {
        return new UnityGatewayCommands(
            instance(mock(CliWrapper)),
            instance(connectionManager),
            () => enabled,
            async () => wizardResult
        );
    }

    it("does nothing when the sign-in wizard is cancelled", async () => {
        await createCommands(undefined).signInCommand();

        verify(connectionManager.signIn(anything())).never();
    });

    it("signs in with the profile the wizard returns", async () => {
        const authProvider = new ProfileAuthProvider(
            new URL("https://a.cloud.databricks.com"),
            "a",
            instance(mock(CliWrapper))
        );

        await createCommands(authProvider).signInCommand();

        verify(connectionManager.signIn(authProvider)).once();
    });

    it("ignores a sign-in that finishes after the experiment is turned off", async () => {
        const authProvider = new ProfileAuthProvider(
            new URL("https://a.cloud.databricks.com"),
            "a",
            instance(mock(CliWrapper))
        );

        await createCommands(authProvider, false).signInCommand();

        verify(connectionManager.signIn(anything())).never();
    });

    it("ignores a sign-in that isn't a saved profile", async () => {
        const authProvider = new DatabricksCliAuthProvider(
            new URL("https://a.cloud.databricks.com"),
            "databricks",
            instance(mock(CliWrapper))
        );

        await createCommands(authProvider).signInCommand();

        verify(connectionManager.signIn(anything())).never();
    });

    it("doesn't start a second sign-in while one is in progress", async () => {
        let wizardRuns = 0;
        let finishWizard!: () => void;
        const commands = new UnityGatewayCommands(
            instance(mock(CliWrapper)),
            instance(connectionManager),
            () => true,
            () => {
                wizardRuns++;
                return new Promise((resolve) => {
                    finishWizard = () => resolve(undefined);
                });
            }
        );

        const first = commands.signInCommand();
        await commands.signInCommand();
        finishWizard();
        await first;

        assert.strictEqual(wizardRuns, 1);
    });

    it("signs out", async () => {
        await createCommands(undefined).signOutCommand();

        verify(connectionManager.signOut()).once();
    });

    describe("promptSignIn", () => {
        let executed: string[];

        beforeEach(() => {
            executed = [];
        });

        function createPromptingCommands(
            showWarning: (
                message: string,
                ...items: string[]
            ) => Thenable<string | undefined>,
            isEnabled = () => true
        ) {
            return new UnityGatewayCommands(
                instance(mock(CliWrapper)),
                instance(connectionManager),
                isEnabled,
                async () => undefined,
                showWarning,
                async (command) => executed.push(command)
            );
        }

        it("runs the sign-in command when the user picks the prompt's button", async () => {
            const shown: unknown[][] = [];
            const commands = createPromptingCommands(async (...args) => {
                shown.push(args);
                return "Sign in to Unity Gateway";
            });

            await commands.promptSignIn("Unity Gateway isn't connected.");

            assert.deepStrictEqual(shown, [
                ["Unity Gateway isn't connected.", "Sign in to Unity Gateway"],
            ]);
            assert.deepStrictEqual(executed, [
                "databricks.unityGateway.signIn",
            ]);
        });

        it("doesn't sign in when the prompt is dismissed", async () => {
            await createPromptingCommands(async () => undefined).promptSignIn(
                "Unity Gateway isn't connected."
            );

            assert.deepStrictEqual(executed, []);
        });

        it("doesn't prompt once the experiment is turned off", async () => {
            let prompts = 0;

            await createPromptingCommands(
                async () => {
                    prompts++;
                    return "Sign in to Unity Gateway";
                },
                () => false
            ).promptSignIn("Unity Gateway isn't connected.");

            assert.strictEqual(prompts, 0);
        });

        it("doesn't sign in if the experiment is turned off while the prompt is open", async () => {
            let enabled = true;

            await createPromptingCommands(
                async () => {
                    enabled = false;
                    return "Sign in to Unity Gateway";
                },
                () => enabled
            ).promptSignIn("Unity Gateway isn't connected.");

            assert.deepStrictEqual(executed, []);
        });

        it("shows a prompt while another is open", async () => {
            // VS Code replaces the open one, which can be hidden away in the
            // notification center, unsettled.
            let prompts = 0;
            const commands = createPromptingCommands(() => {
                prompts++;
                return new Promise(() => {});
            });

            void commands.promptSignIn("a");
            void commands.promptSignIn("a");

            assert.strictEqual(prompts, 2);
        });
    });
});
