import type { TelemetryRecorder } from "../../kernel/telemetry";
import type { Logger } from "../../platform/log";
import type { ResolvedEnvironment } from "./msPythonApi";
import { detectPackageManagers } from "./setup/packageManagerDetection";
import { collectPackageManagerSignals } from "./setup/packageManagerSignals";
import { resolveSetupMode, type PythonEnvironmentSetupMode } from "./setup/pythonSetupGate";
import { PYTHON_ENV_SETUP_DETECTED, type SetupTrigger, type TargetCompute } from "./telemetry";

export interface PackageManagerTelemetryInputs {
    readonly telemetry: Pick<TelemetryRecorder, "isEnabled" | "record">;
    activeEnvironment(resource: string): Promise<ResolvedEnvironment | undefined>;
    projectRoot(): string | undefined;
    computeType(): TargetCompute;
    isConnected(): boolean;
    setupMode(): PythonEnvironmentSetupMode;
    readonly log: Logger;
}

/**
 * Collects package-manager signals at project-setup touchpoints and records
 * `python_env.setup.detected`. Ported from the old `PackageManagerTelemetry`;
 * the event is recorded directly instead of through a method patched onto
 * `Telemetry`'s prototype.
 *
 * All probing is best-effort and non-blocking: any failure degrades to
 * `unknown` and is swallowed, never thrown into the user's setup/run flow.
 * Only categorical/enum data is emitted — no paths, package names, or other
 * free-form content (see {@link detectPackageManagers}).
 */
export class PackageManagerTelemetry {
    /**
     * Triggers already emitted for the current `(project, trigger)` pair, to
     * deduplicate within a session so one project open doesn't inflate counts.
     */
    private readonly emitted = new Set<string>();

    constructor(private readonly inputs: PackageManagerTelemetryInputs) {}

    /**
     * Detect the package manager(s) for the active project and emit telemetry.
     * Deduplicated per `(project root, trigger)` within the session. Only emits
     * while connected to a Databricks workspace, so the data describes active
     * users' projects (not extension installs that never authenticate). Never
     * throws.
     */
    async emitDetection(trigger: SetupTrigger): Promise<void> {
        const { inputs } = this;
        try {
            // Bail before any disk access when telemetry is disabled, so an
            // opted-out user gets zero telemetry-driven file reads (not just a
            // dropped send).
            if (!inputs.telemetry.isEnabled) {
                return;
            }
            const projectRoot = inputs.projectRoot();
            if (projectRoot === undefined) {
                return;
            }
            // Only report for authenticated sessions. Checked before the dedupe
            // bookkeeping so a pre-connect call doesn't consume the dedupe slot
            // and suppress the real emit once connected.
            if (!inputs.isConnected()) {
                return;
            }
            const dedupeKey = `${trigger}:${projectRoot}`;
            if (this.emitted.has(dedupeKey)) {
                return;
            }
            this.emitted.add(dedupeKey);

            const env = await this.resolveEnvironment(projectRoot);
            const detection = detectPackageManagers(
                collectPackageManagerSignals(projectRoot, env, (message, e) =>
                    inputs.log.debug(message, e),
                ),
            );
            const pythonVersion = pythonMinorVersion(env);
            inputs.telemetry.record(PYTHON_ENV_SETUP_DETECTED, {
                managersDetected: detection.managers,
                primaryManager: detection.primary,
                signals: detection.signals,
                interpreterSource: detection.interpreterSource,
                hasLockfile: detection.hasLockfile,
                targetCompute: inputs.computeType(),
                setupTrigger: trigger,
                setupMode: resolveSetupMode(inputs.setupMode(), detection),
                // Omitted when unknown, as before (the recorder skips undefined).
                pythonVersion,
            });
        } catch (e) {
            // Detection is measurement-only and must never disrupt setup.
            inputs.log.debug("Package manager detection failed", e);
        }
    }

    private async resolveEnvironment(
        projectRoot: string,
    ): Promise<ResolvedEnvironment | undefined> {
        try {
            return await this.inputs.activeEnvironment(projectRoot);
        } catch (e) {
            this.inputs.log.debug("Failed to resolve python environment", e);
            return undefined;
        }
    }
}

/** Detected interpreter minor version (e.g. "3.11"), if available. */
function pythonMinorVersion(env: ResolvedEnvironment | undefined): string | undefined {
    const version = env?.version;
    if (version?.major === undefined || version.minor === undefined) {
        return undefined;
    }
    return `${version.major}.${version.minor}`;
}
