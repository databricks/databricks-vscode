import * as vscode from "vscode";
import { createPublicApi, type PublicApi } from "./api";
import { FEATURES } from "./features";
import { ACTIVATED, CONNECTED, PROJECT } from "./kernel/contextKeys";
import { BUNDLE_LOG_CHANNEL_NAME } from "./kernel/bundle/BundleLog";
import { BUNDLE_BUSY } from "./kernel/bundle/BundleOperations";
import { CONFIGURE_LOGIN } from "./kernel/connection/commands";
import { createKernel } from "./kernel/createKernel";
import { registerFeatures, startFeatures } from "./kernel/feature";
import {
    capabilityContextValues,
    computeHostWarning,
    detectHost,
    REMOTE_MODE,
    type Host,
} from "./kernel/host";
import {
    COMMAND_EXECUTION,
    createTelemetry,
    EXTENSION_ACTIVATION,
    toUserMetadata,
} from "./kernel/telemetry";
import { checkArchitecture, packageMetadata } from "./platform/architecture";
import { CommandRegistry } from "./platform/commands";
import { ContextKeys } from "./platform/contextKeys";
import { UserFacingError } from "./platform/errors";
import { disposeAll } from "./platform/event";
import { ChannelSink, JsonFileSink, Log, LOG_CHANNEL_NAME, LOG_FILE_NAME } from "./platform/log";
import { nodeProcessRunner } from "./platform/process";
import { Settings } from "./platform/settings";
import { StateStore } from "./platform/state";
import { ConfigurationSections } from "./platform/ui/sections";
import {
    vscodeExtensions,
    vscodeFileEvents,
    vscodeFileSearch,
    workspaceFolders,
} from "./platform/workspace";

/** Platform, then kernel, then the features. */
export function activate(context: vscode.ExtensionContext): PublicApi | undefined {
    const metadata = packageMetadata(context.extension.packageJSON);
    const archError = checkArchitecture(metadata);
    if (archError !== undefined) {
        void vscode.window.showErrorMessage(archError);
        return undefined;
    }

    // Platform
    const channel = vscode.window.createOutputChannel(LOG_CHANNEL_NAME, { log: true });
    const fileSink = new JsonFileSink(vscode.Uri.joinPath(context.logUri, LOG_FILE_NAME).fsPath);
    const log = new Log([new ChannelSink(channel), fileSink], "Extension");
    const state = new StateStore({
        global: context.globalState,
        workspace: context.workspaceState,
    });
    const settings = new Settings(vscode.workspace);
    const contextKeys = new ContextKeys((name, value) =>
        vscode.commands.executeCommand("setContext", name, value),
    );
    const sections = new ConfigurationSections();
    const folders = workspaceFolders();
    context.subscriptions.push(channel, fileSink, state, sections, folders);

    // Kernel
    const host = detectHost(process.env, { remoteName: vscode.env.remoteName });
    const telemetry = createTelemetry(host.kind === "session" ? "remote" : "normal");
    context.subscriptions.push({ dispose: () => void telemetry.dispose() });
    const kernel = createKernel({
        extension: {
            id: context.extension.id,
            version: metadata.version,
            logPath: context.logUri.fsPath,
            asAbsolutePath: (p) => context.asAbsolutePath(p),
            cliVersion: metadata.cliVersion,
            isDevelopment: context.extensionMode === vscode.ExtensionMode.Development,
            globalStoragePath: context.globalStorageUri.fsPath,
        },
        state,
        settings,
        contextKeys,
        runner: nodeProcessRunner,
        log: log.child("kernel"),
        env: process.env,
        host,
        isCursor: vscode.env.uriScheme === "cursor",
        folders,
        files: vscodeFileEvents,
        search: vscodeFileSearch,
        extensions: vscodeExtensions,
        bundleLogChannel: () =>
            vscode.window.createOutputChannel(BUNDLE_LOG_CHANNEL_NAME, { log: true }),
        showLog: () => channel.show(true),
        terminalEnvironment: context.environmentVariableCollection,
    });
    context.subscriptions.push(kernel);
    const registry = new CommandRegistry(
        {
            registerCommand: (id, callback) => vscode.commands.registerCommand(id, callback),
            showErrorMessage: (message, ...actions) =>
                vscode.window.showErrorMessage(message, ...actions),
            executeCommand: (id, ...args) => vscode.commands.executeCommand(id, ...args),
        },
        (execution) => telemetry.record(COMMAND_EXECUTION, execution),
        log.child("commands"),
    );
    context.subscriptions.push(
        registry.defineScope("connection", {
            current: () => kernel.connection.connection,
            unavailable: () =>
                kernel.capabilities.identity === "session"
                    ? new UserFacingError(
                          "NOT_CONNECTED",
                          "This window isn't connected with the SSH tunnel's credentials.",
                          {
                              actions: [
                                  { title: "Reconnect", run: () => kernel.connection.reconnect() },
                              ],
                          },
                      )
                    : new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first.", {
                          actions: [
                              {
                                  title: "Sign in",
                                  run: () => vscode.commands.executeCommand(CONFIGURE_LOGIN),
                              },
                          ],
                      }),
        }),
        registry.defineScope("project", {
            current: () => kernel.project.active.value,
            unavailable: () =>
                new UserFacingError("NO_PROJECT", "Open a Databricks project first.", {
                    actions: [
                        {
                            title: "Open folder",
                            run: () => vscode.commands.executeCommand("vscode.openFolder"),
                        },
                    ],
                }),
        }),
        kernel.project.active.onDidChange((p) => void contextKeys.set(PROJECT, p !== undefined)),
        kernel.bundle.operations.busy.onDidChange(
            (busy) => void contextKeys.set(BUNDLE_BUSY, busy),
        ),
        kernel.connection.state.onDidChange((s) => {
            void contextKeys.set(CONNECTED, s.status === "connected");
            if (s.status !== "connected") {
                // As the old extension did: events while not connected carry no user.
                telemetry.setMetadata("user", {});
                return;
            }
            const { userName, host, workspaceId, authType } = s.connection;
            // The host name, without the scheme, as the old extension sent it (`URL.host`).
            // Set before the feature listeners below record this change's events.
            telemetry.setMetadata(
                "user",
                toUserMetadata({ userName, host: new URL(host).host, workspaceId, authType }),
            );
        }),
    );

    // Features
    const registered = registerFeatures(FEATURES, {
        kernel,
        registry,
        sections,
        telemetry,
        log,
        host,
    });
    for (const { ctx } of registered) {
        // Not a copy: features may add subscriptions after they register.
        context.subscriptions.push({ dispose: () => disposeAll(ctx.subscriptions) });
    }

    void contextKeys.set(ACTIVATED, true);
    void contextKeys.set(CONNECTED, false);
    void contextKeys.set(PROJECT, false);
    void contextKeys.set(BUNDLE_BUSY, false);
    for (const [key, value] of capabilityContextValues(kernel.capabilities)) {
        void contextKeys.set(key, value);
    }
    void contextKeys.set(REMOTE_MODE, host.kind === "session");
    telemetry.record(EXTENSION_ACTIVATION);
    // The host too: the window and a session can run different versions of the extension.
    log.info(
        `Activated ${kernel.extension.id} ${kernel.extension.version} in a ${host.kind} window`,
    );
    logHost(log, host);
    kernel.start();
    startFeatures(registered);
    return createPublicApi(
        kernel,
        () => vscode.commands.executeCommand(CONFIGURE_LOGIN),
        context.subscriptions,
    );
}

export function deactivate(): void {}

/** What a session or a compute window should know about where it runs; secrets stay in the environment. */
function logHost(log: Log, host: Host): void {
    switch (host.kind) {
        case "session":
            log.info("Session window", {
                entry: host.entry,
                host: host.host,
                compute: host.compute,
                interpreter: host.interpreter,
            });
            host.warnings.forEach((w) => log.warn(w));
            return;
        case "compute": {
            const warning = computeHostWarning(host);
            log.warn(warning);
            void vscode.window.showWarningMessage(warning);
            return;
        }
        case "local":
            return;
    }
}
