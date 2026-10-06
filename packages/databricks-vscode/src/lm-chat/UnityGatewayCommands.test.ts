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
});
