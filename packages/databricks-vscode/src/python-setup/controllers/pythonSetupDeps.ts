import {existsSync} from "fs";
import path from "path";
import {commands, ProgressLocation, Uri, window} from "vscode";
import {PackageManagerDetection} from "../../language/packageManagerDetection";
import {Telemetry} from "../../telemetry";
import "../../telemetry/pythonSetupExtensions";
import {PythonSetupState} from "../../vscode-objs/StateStorage";
import type {PythonEnvironmentSetupMode} from "../../vscode-objs/WorkspaceConfigs";
import {openExternal} from "../../utils/urlUtils";
import {PythonSetupErrorAction} from "../utils/errorMessages";
import {ReportEnvironment} from "../utils/reportSetupIssue";
import {isUvSetupSuitable} from "../utils/pythonSetupGate";
import {withElapsedProgress} from "../utils/setupProgress";
import {formatSetupLog, formatSetupNotification} from "../utils/setupSummary";
import {venvInterpreterPath} from "../utils/venvInterpreterPath";
import {readVenvProjectName} from "../utils/venvProjectName";
import {
    CliRunner,
    PythonSetupPersistedState,
    PythonSetupSetupDeps,
    SetupCompute,
} from "./PythonSetupEnvironmentSetup";

type Detection = Pick<
    PackageManagerDetection,
    "primary" | "managers" | "signals"
>;

/**
 * The compute currently attached in the connection, reduced to what compute
 * resolution needs. Mirrors the relevant {@link ConnectionManager} getters.
 */
export interface AttachedCompute {
    serverless: boolean;
    cluster: {id: string} | undefined;
    /** Persisted serverless environment version, if one was chosen. */
    serverlessVersion: string | undefined;
}

/**
 * The outcome of classifying the attached compute. `needsServerlessVersion` is
 * deliberately distinct from `none`: serverless IS selected in that state, only
 * the version is missing, so the caller resolves one rather than telling the
 * user to select compute they already selected.
 */
export type ComputeResolution =
    | {status: "ok"; compute: SetupCompute}
    | {status: "needsServerlessVersion"}
    | {status: "none"};

/**
 * Map the attached compute to a setup-local compute target. Pure so the
 * cluster/serverless/none branching is unit-testable.
 *
 * A cluster attachment wins outright (its DBR fully determines the
 * environment), so it is checked first and a missing serverless version never
 * matters on that path. A serverless session resolves to its persisted version
 * when one was recorded; without it this reports `needsServerlessVersion` so the
 * caller can resolve one, because a version-less serverless selection is
 * reachable in normal use -- a `serverlessComputeId: auto` config enables
 * serverless without ever opening the picker, a selection made while the feature
 * was disabled records no version, and a persisted version outside the supported
 * range is dropped to undefined on load.
 */
export function resolveComputeFrom(
    compute: AttachedCompute
): ComputeResolution {
    if (compute.cluster) {
        return {
            status: "ok",
            compute: {kind: "cluster", clusterId: compute.cluster.id},
        };
    }
    if (compute.serverless) {
        if (compute.serverlessVersion === undefined) {
            return {status: "needsServerlessVersion"};
        }
        return {
            status: "ok",
            compute: {kind: "serverless", version: compute.serverlessVersion},
        };
    }
    return {status: "none"};
}

/**
 * Build the visibility gate for the config-view entry: the active project must
 * be one the uv-native setup fits (a clean uv/greenfield project, no competing
 * manager -- see {@link isUvSetupSuitable}). This same predicate decides whether
 * the uv flow is the active surface for the project, so a project that isn't
 * uv-suitable falls back to the legacy checklist instead.
 *
 * The gate is rendered on the config-view path, so it must never throw: any
 * failure (a rejecting `projectRoot`/`detect`) degrades to `false` so the
 * Environment section keeps showing the legacy checklist rather than rendering
 * empty. Note the classification itself still fails *open*: `detect` maps a
 * signal-collection failure to `unknown`/`[]`, which reads as greenfield and so
 * shows the entry -- an unclassifiable project is treated as safe to offer.
 *
 * `setupMode` is the user's opt-out: `manual` hides the uv flow outright (before
 * any detection), so a valid existing interpreter is used as-is and no project
 * ever needs to reach `raw.githubusercontent.com` for runtime constraints. This
 * is the single gate every entry point reads (config view, the setup command's
 * routing, and the serverless-version prompt), so honoring it here covers them
 * all.
 */
export function makePythonSetupVisibility(deps: {
    detect: (projectRoot: string) => Promise<Detection>;
    projectRoot: () => string | undefined;
    setupMode: () => PythonEnvironmentSetupMode;
}): () => Promise<boolean> {
    return async () => {
        try {
            if (deps.setupMode() === "manual") {
                return false;
            }
            const root = deps.projectRoot();
            if (root === undefined) {
                return false;
            }
            const detection = await deps.detect(root);
            return isUvSetupSuitable(detection);
        } catch {
            return false;
        }
    };
}

/**
 * Collaborators the extension supplies to assemble the orchestrator's deps.
 * Grouped here so `activate()` stays thin and the wiring is exercised in one
 * place rather than inlined.
 */
export interface PythonSetupWiringDeps {
    cli: CliRunner;
    projectRoot: () => string | undefined;
    detect: (projectRoot: string) => Promise<Detection>;
    /**
     * The user's `databricks.python.environmentSetup` choice. `manual` opts the
     * project out of uv-native setup entirely (see {@link makePythonSetupVisibility}).
     */
    setupMode: () => PythonEnvironmentSetupMode;
    attachedCompute: () => AttachedCompute;
    /**
     * Ask the user which serverless version to provision, for a serverless
     * session that has none recorded. Returns the bare version, or undefined
     * when the user dismisses the prompt.
     */
    promptServerlessVersion: () => Promise<string | undefined>;
    /**
     * Persist a confirmed serverless version alongside the current serverless
     * selection, so the next run does not ask again.
     */
    persistServerlessVersion: (version: string) => Promise<void>;
    /**
     * Open the compute picker when nothing is attached, resolving to the chosen
     * compute (or `undefined` if dismissed). The caller uses this return value
     * directly, not a re-read of {@link attachedCompute}: a cluster attach
     * propagates asynchronously, so an immediate re-read would race it.
     */
    promptSelectCompute: () => Promise<SetupCompute | undefined>;
    /** Point the MS Python extension at an interpreter path (project-scoped). */
    setActiveInterpreter: (interpreterPath: string, root: Uri) => Promise<void>;
    /** Persist the post-setup state (workspace-scoped) for drift detection. */
    persistSetupState: (state: PythonSetupState) => void;
    /**
     * Sink for the CLI's streamed output (an output channel in the extension).
     * `append` receives each chunk as it arrives; `show` reveals the channel so
     * the user can read the full log when a run fails.
     */
    log: {
        append: (chunk: string) => void;
        show: () => void;
    };
    /**
     * Static build context stamped into a "Report this problem" issue body
     * (extension/CLI versions, OS). The per-run package manager is merged in by
     * the orchestrator.
     */
    reportEnvironment: ReportEnvironment;
    /** Records the setup attempt/result events. */
    telemetry: Telemetry;
}

/** User-facing copy for the expired-session re-login prompt. */
const REAUTH_PROMPT_MESSAGE =
    "Your Databricks session has expired. Log in again to set up the Python environment.";

/**
 * The extension's re-auth command (opens the login flow for the active profile
 * and reconnects). Reused rather than shelling out to `databricks auth login`
 * so host, profile, and workspace-id routing stay owned by one place.
 */
const RELOGIN_COMMAND_ID = "databricks.connection.configureLogin";

/**
 * Assemble the {@link PythonSetupSetupDeps} for the real extension: the gate and
 * compute resolution come from the pure helpers above, the interpreter is
 * adopted via the MS Python extension, and progress/toasts use `window`.
 */
export function makePythonSetupDeps(
    wiring: PythonSetupWiringDeps
): PythonSetupSetupDeps {
    const isVisible = makePythonSetupVisibility(wiring);

    return {
        cli: wiring.cli,
        projectRoot: wiring.projectRoot,
        isVisible,
        resolveCompute: async () => {
            const resolution = resolveComputeFrom(wiring.attachedCompute());
            if (resolution.status === "none") {
                // Nothing attached: offer the picker inline instead of
                // dead-ending. Use its return value (not a racy re-read);
                // `undefined` means dismissed, so fall through to `none`.
                const picked = await wiring.promptSelectCompute();
                return picked === undefined
                    ? {status: "none"}
                    : {status: "ok", compute: picked};
            }
            if (resolution.status !== "needsServerlessVersion") {
                return resolution;
            }
            // Serverless is selected and only the version is missing, so ask for
            // that rather than telling the user to select compute they have
            // already selected.
            const version = await wiring.promptServerlessVersion();
            if (version === undefined) {
                return {status: "cancelled"};
            }
            try {
                await wiring.persistServerlessVersion(version);
            } catch {
                // Persistence only buys "don't ask again": if the config write
                // fails the user has already told us the version, so run with it
                // rather than discarding a confirmed answer. (The production
                // wiring surfaces the failure itself.)
            }
            return {status: "ok", compute: {kind: "serverless", version}};
        },
        adoptInterpreter: async (venvPath: string, projectRoot: string) => {
            await wiring.setActiveInterpreter(
                venvInterpreterPath(venvPath),
                Uri.file(projectRoot)
            );
        },
        // Stamp the persisted state with the completion time here (the
        // orchestrator supplies the env identity; the timestamp is a wiring
        // concern) and hand it to the injected store for drift detection.
        saveState: (state: PythonSetupPersistedState) => {
            wiring.persistSetupState({
                ...state,
                timestamp: new Date().toISOString(),
            });
        },
        notify: async (message: string) => {
            // Pre-flight guidance: no CLI ran, so show a plain warning without
            // revealing the (empty) output channel.
            await window.showWarningMessage(message);
        },
        showReauthPrompt: async () => {
            // A warning, not an error, and no log reveal: an expired session is
            // expected, not a defect. The "Login" button runs the extension's
            // existing re-auth flow for the active profile; the user re-runs
            // setup once connected (we deliberately don't auto-retry).
            const login = "Login";
            const picked = await window.showWarningMessage(
                REAUTH_PROMPT_MESSAGE,
                login
            );
            if (picked === login) {
                await commands.executeCommand(RELOGIN_COMMAND_ID);
            }
        },
        showError: async (
            message: string,
            detail?: string,
            actions: PythonSetupErrorAction[] = []
        ) => {
            // The mapped one-liner is deliberately concise and drops the CLI's
            // own explanation; write that detail into the channel so the log the
            // popup points at actually contains it (under `--output json` the CLI
            // streams little else).
            if (detail !== undefined && detail.length > 0) {
                wiring.log.append(detail);
            }
            // Reveal the output channel automatically so the full log is in
            // front of the user when setup fails, then still raise the
            // notification (with its jump-to-logs button) as before.
            wiring.log.show();
            const showLogs = "Show Logs";
            // `showErrorMessage` hands the picked value back as a bare label
            // string, so two buttons sharing a label are indistinguishable. Drop
            // any remediation reusing the reserved "Show Logs" label, and any
            // later duplicate label (first wins), rather than offer an ambiguous
            // button whose dispatch would be dead.
            const seen = new Set<string>([showLogs]);
            const remediations = actions.filter((a) => {
                if (seen.has(a.label)) {
                    return false;
                }
                seen.add(a.label);
                return true;
            });
            // Lead with the remediation buttons (e.g. "Install uv", then
            // "Installation guide") in order, so the action the user most likely
            // wants comes first; "Show Logs" always trails.
            const buttons = [...remediations.map((a) => a.label), showLogs];
            const picked = await window.showErrorMessage(message, ...buttons);
            if (picked === showLogs) {
                wiring.log.show();
                return;
            }
            const chosen = remediations.find((a) => a.label === picked);
            if (chosen === undefined) {
                // Dismissed, or a label we did not render.
                return;
            }
            // showError is the failure-reporting path and its one caller does not
            // wrap it, so nothing thrown here may escape — contain and record any
            // failure.
            try {
                if (chosen.command) {
                    // A command-action (e.g. "Install uv", E_FETCH "Use manual
                    // setup") runs a registered VS Code command instead of
                    // opening a URL.
                    await commands.executeCommand(chosen.command);
                } else if (chosen.url) {
                    const opened = await openExternal(chosen.url);
                    if (!opened) {
                        wiring.log.append(
                            `\nCould not open ${chosen.url} in a browser.\n`
                        );
                    }
                }
            } catch (e) {
                const what = chosen.command
                    ? `run ${chosen.command}`
                    : `open ${chosen.url}`;
                wiring.log.append(
                    `\nFailed to ${what}: ${
                        e instanceof Error ? e.message : String(e)
                    }\n`
                );
            }
        },
        showSuccess: async (result) => {
            // Write the full breakdown to the log channel: in --output json
            // mode the CLI streams little or nothing to stderr on success, so
            // the channel would otherwise be empty. This is where the details
            // the one-line message omits (versions, compute, backup, how to run
            // notebooks, full warnings) live. Enrich the venv lines with the
            // project name uv recorded in pyvenv.cfg when it can be read.
            const projectName = result.venvPath
                ? await readVenvProjectName(result.venvPath)
                : undefined;
            wiring.log.append(formatSetupLog(result, projectName));
            // Reveal the output channel automatically so those details are in
            // front of the user, then still raise the notification (with its
            // "View Details" button) as before.
            wiring.log.show();
            // A standard (non-modal) notification, not a modal dialog: the
            // outcome is informational, not something to interrupt the user
            // for. This path runs only on a successful setup, so it stays an
            // info toast even when the run carried warnings — the count is in
            // the message and the warnings themselves are in the details.
            const message = formatSetupNotification(result);
            const viewDetails = "View Details";
            const choice = await window.showInformationMessage(
                message,
                viewDetails
            );
            if (choice === viewDetails) {
                wiring.log.show();
            }
        },
        reportEnvironment: wiring.reportEnvironment,
        recordSetupAttempt: (attempt) =>
            wiring.telemetry.recordPythonSetupAttempt(attempt),
        recordNoCompute: () => wiring.telemetry.recordPythonSetupNoCompute(),
        getDetection: async () => {
            const root = wiring.projectRoot();
            if (root === undefined) {
                return undefined;
            }
            // Same detection the gate ran for this click. It is re-run rather
            // than cached because a project's markers can change between the
            // config view rendering the entry and the user pressing it.
            return wiring.detect(root);
        },
        hasPyprojectToml: async (projectRoot: string) =>
            existsSync(path.join(projectRoot, "pyproject.toml")),
        withProgress: (title, task) =>
            // window.withProgress returns a Thenable; the seam is typed as a
            // Promise, so normalise it. `cancellable` is required for the token
            // to ever fire -- without it VS Code shows no Cancel button and the
            // downstream cancellation path (CLI teardown, PythonSetupCancelledError)
            // would be dead. `log` is forwarded so the CLI's streamed output
            // reaches the output channel instead of being dropped.
            Promise.resolve(
                window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title,
                        cancellable: true,
                    },
                    (progress, token) =>
                        // The CLI streams no progress under `--output json`, so
                        // narrate the run from elapsed time instead of leaving the
                        // notification mute for the ~minute-plus it takes (see
                        // setupProgress).
                        withElapsedProgress(progress, () =>
                            task((chunk) => wiring.log.append(chunk), token)
                        )
                )
            ),
    };
}
