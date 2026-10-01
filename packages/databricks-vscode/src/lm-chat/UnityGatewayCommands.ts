import {window} from "vscode";
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
        private readonly runLoginWizard = (cli: CliWrapper) =>
            LoginWizard.run(cli)
    ) {}

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
            await this.connectionManager.signIn(authProvider);
        });
    }

    @onError({popup: {prefix: "Error signing out of Unity Gateway."}})
    async signOutCommand() {
        await this.connectionManager.signOut();
    }
}
