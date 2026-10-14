import {commands, window} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import {LoginWizard} from "../configuration/LoginWizard";
import {Mutex} from "../locking";
import {onError} from "../utils/onErrorDecorator";
import {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";

export class UnityGatewayCommands {
    private readonly signInMutex = new Mutex();

    constructor(
        private readonly cli: CliWrapper,
        private readonly connectionManager: UnityGatewayConnectionManager,
        private readonly isEnabled: () => boolean,
        private readonly runLoginWizard = (cli: CliWrapper) =>
            LoginWizard.run(cli),
        private readonly showWarning = (message: string, ...items: string[]) =>
            window.showWarningMessage(message, ...items),
        private readonly executeCommand = (command: string) =>
            commands.executeCommand(command)
    ) {}

    /**
     * Offers to sign in again after a chat request fails for want of a
     * sign-in. VS Code replaces an identical notification, so failures in a
     * row leave one prompt.
     */
    async promptSignIn(message: string) {
        // The experiment can be turned off while a request is in flight, or
        // while the prompt is open.
        if (!this.isEnabled()) {
            return;
        }
        const signIn = "Sign in to Unity Gateway";
        if (
            (await this.showWarning(message, signIn)) === signIn &&
            this.isEnabled()
        ) {
            await this.executeCommand("databricks.unityGateway.signIn");
        }
    }

    /** Also switches the workspace when already signed in. */
    @onError({popup: {prefix: "Error signing in to Unity Gateway."}})
    async signInCommand() {
        if (this.signInMutex.locked) {
            window.showErrorMessage(
                "Databricks: Unity Gateway sign in is already in progress"
            );
            return;
        }
        await this.signInMutex.synchronise(async () => {
            const authProvider = await this.runLoginWizard(this.cli);
            // Undefined when cancelled. Sign-ins are always saved as profiles,
            // which is what lets restore() reconnect later.
            if (!(authProvider instanceof ProfileAuthProvider)) {
                return;
            }
            // The experiment can be turned off while the wizard is open.
            if (!this.isEnabled()) {
                return;
            }
            await this.connectionManager.signIn(authProvider);
        });
    }

    @onError({popup: {prefix: "Error signing out of Unity Gateway."}})
    async signOutCommand() {
        await this.connectionManager.signOut();
    }
}
