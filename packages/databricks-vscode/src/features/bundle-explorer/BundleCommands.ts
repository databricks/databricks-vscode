import { commands, env, ProgressLocation, Uri, window, type CancellationToken } from "vscode";
import type { OperationTarget } from "../../kernel/bundle/BundleOperations";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { isSpogHost } from "../../kernel/connection/hostMatching";
import { CONFIGURE_LOGIN } from "../../kernel/connection/commands";
import type { Kernel } from "../../kernel/feature";
import { UserFacingError } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { PROJECT_VIEW } from "../../kernel/project/commands";
import { bundleCommandError } from "./BundleExplorerCommands";

export const DEPLOY = "databricks.bundle.deploy";
export const FORCE_DEPLOY = "databricks.bundle.forceDeploy";
export const DESTROY = "databricks.bundle.destroy";
export const FORCE_DESTROY = "databricks.bundle.forceDestroy";

/**
 * "Deploy bundle" and "Force deploy bundle" (BNDL-05). A target whose mode
 * isn't development asks first, in the old modal; declining isn't an error.
 * Progress shows on the explorer and in a cancellable notification,
 * and cancelling kills the CLI. Resolves with what was deployed, or
 * undefined when the user declined.
 */
export async function deploy(kernel: Kernel, force = false): Promise<OperationTarget | undefined> {
    const target = requireTarget(kernel);
    const mode = targetMode(kernel, target);
    const title = `Deploying the bundle to ${humaniseMode(mode)} target "${target}".`;
    if (mode !== "development") {
        const choice = await window.showInformationMessage(title, { modal: true }, "Continue");
        if (choice !== "Continue") {
            return undefined;
        }
    }
    kernel.bundleLog.show();
    try {
        return await window.withProgress({ location: { viewId: PROJECT_VIEW } }, () =>
            window.withProgress(
                { location: ProgressLocation.Notification, title, cancellable: true },
                (_progress, token) =>
                    kernel.bundle.operations.deploy({ force, signal: abortSignal(token) }),
            ),
        );
    } catch (e) {
        throw bundleCommandError("Error deploying bundle.", e);
    }
}

const OPEN_WORKSPACE = "Open the workspace in a browser";

/**
 * "Deploy bundle" and "Force deploy bundle" from the explorer. A failure is
 * shown by `deploy`; a success gets a notification with a link to the
 * workspace. Deploy and run has its own result, so it calls `deploy`.
 */
export async function deployAndReport(kernel: Kernel, log: Logger, force = false): Promise<void> {
    const deployed = await deploy(kernel, force);
    if (deployed === undefined) {
        return;
    }
    const link = workspaceLink(deployed.connection);
    void window
        .showInformationMessage(
            `Deployed the bundle to target "${deployed.target}".`,
            OPEN_WORKSPACE,
        )
        .then(
            (choice) => {
                if (choice === OPEN_WORKSPACE) {
                    return env
                        .openExternal(Uri.parse(link))
                        .then(undefined, (e: unknown) =>
                            log.error("Failed to open the workspace", e),
                        );
                }
            },
            (e: unknown) => log.error("Failed to show the deploy notification", e),
        );
}

/**
 * The workspace's page. A unified host serves many workspaces, so its URL
 * names the one connected, as the Unity Catalog favorites key does.
 */
function workspaceLink(connection: Pick<Connection, "host" | "workspaceId">): string {
    let url: URL;
    try {
        url = new URL(connection.host);
    } catch {
        return connection.host;
    }
    if (connection.workspaceId !== undefined && isSpogHost(url)) {
        url.searchParams.set("o", connection.workspaceId);
        return url.toString();
    }
    return connection.host;
}

/**
 * "Destroy bundle" and "Force destroy bundle" (BNDL-06). The arguments are
 * part of the e2e contract: `destroy(false, false)` skips the warning,
 * because modals can't be answered in tests.
 */
export async function destroy(
    kernel: Kernel,
    log: Logger,
    force = false,
    warn = true,
): Promise<void> {
    const target = requireTarget(kernel);
    if (warn) {
        const choice = await window.showWarningMessage(
            "Are you sure you want to destroy this bundle and all resources associated with it?",
            { modal: true },
            "Yes, continue",
            "No",
        );
        if (choice !== "Yes, continue") {
            return;
        }
    }
    kernel.bundleLog.show();
    try {
        await window.withProgress({ location: { viewId: PROJECT_VIEW } }, () =>
            window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Destroying the bundle",
                    cancellable: true,
                },
                (_progress, token) =>
                    kernel.bundle.operations.destroy({ force, signal: abortSignal(token) }),
            ),
        );
    } catch (e) {
        throw bundleCommandError("Error destroying bundle.", e);
    }
    // Nothing is left to open, so the notification has no link.
    void window
        .showInformationMessage(`Destroyed the bundle in target "${target}".`)
        .then(undefined, (e: unknown) => log.error("Failed to show the destroy notification", e));
}

/**
 * The commands are in project scope; they also need a target and a
 * connection, which the scope doesn't check.
 */
export function requireTarget(kernel: Kernel): string {
    const target = kernel.project.target.value;
    if (target === undefined) {
        throw new UserFacingError("NO_TARGET", "Select a bundle target first.");
    }
    if (kernel.connection.connection === undefined) {
        throw new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first.", {
            actions: [{ title: "Sign in", run: () => commands.executeCommand(CONFIGURE_LOGIN) }],
        });
    }
    return target;
}

/** The resolved mode when validate has run for the target, else the YAML's. */
function targetMode(kernel: Kernel, target: string): string | undefined {
    const validated = kernel.bundle.validated.latest;
    if (validated?.target === target && validated.config.bundle?.mode !== undefined) {
        return validated.config.bundle.mode;
    }
    return kernel.project.active.value?.config.targets.find((t) => t.name === target)?.mode;
}

/** The old `humaniseMode`: "development" becomes "Development". */
function humaniseMode(mode?: string): string {
    return mode === undefined ? "" : mode.charAt(0).toUpperCase() + mode.slice(1);
}

function abortSignal(token: CancellationToken): AbortSignal {
    const controller = new AbortController();
    if (token.isCancellationRequested) {
        controller.abort();
    }
    token.onCancellationRequested(() => controller.abort());
    return controller.signal;
}
